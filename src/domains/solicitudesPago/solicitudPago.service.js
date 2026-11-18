const SolicitudPago = require("./solicitudPago.model");
const Comprobante = require("../comprobantes/comprobante.model");
const EventoInstitucional = require("../eventos/eventoInstitucional.model");
const rules = require("../../rules/politicaPagos.rules");
const { fechaHoyISO } = require("../../utils/fechas");
const logger = require("../../utils/logger");

async function registrarSolicitud({
  tipo,
  fechaSolicitud,
  fechaDesembolsoRequerida,
  justificacion,
  solicitanteTelegramId,
  solicitanteNombre,
  eventoInstitucionalId = null,
}) {
  if (eventoInstitucionalId) {
    const evento = await EventoInstitucional.findByPk(eventoInstitucionalId);
    if (!evento) return { error: `No existe el evento institucional #${eventoInstitucionalId}.` };
    if (evento.estado !== "aprobado_programacion") {
      return {
        error: `El evento institucional #${eventoInstitucionalId} está en estado "${evento.estado}" y no puede generar solicitudes de pago todavía.`,
      };
    }
  }

  const validacion = rules.validarAnticipacionSolicitud({
    tipo,
    fechaSolicitud,
    fechaDesembolsoRequerida,
    justificacion,
  });

  let estado = "rechazada";
  if (validacion.valido && validacion.requiereAutorizacion) {
    estado = "pendiente_autorizacion_excepcional";
  } else if (validacion.valido) {
    estado = "pendiente";
  }

  const solicitud = await SolicitudPago.create({
    eventoInstitucionalId: eventoInstitucionalId || null,
    tipo,
    fechaSolicitud,
    fechaDesembolsoRequerida,
    justificacion: justificacion || null,
    solicitanteTelegramId,
    solicitanteNombre,
    estado,
    motivoRechazo: validacion.valido ? null : validacion.motivo,
    autorizacionExcepcional: validacion.requiereAutorizacion ? null : false,
  });

  logger.info("Solicitud de pago registrada", {
    id: solicitud.id,
    estado: solicitud.estado,
    politica: rules.POLITICA_PAGOS_VERSION,
  });
  return { solicitud, validacion };
}

async function listarPorSolicitante(solicitanteTelegramId) {
  return SolicitudPago.findAll({
    where: { solicitanteTelegramId },
    order: [["createdAt", "DESC"]],
    limit: 10,
  });
}

async function listarPendientes() {
  return SolicitudPago.findAll({
    where: { estado: "pendiente" },
    order: [["fechaDesembolsoRequerida", "ASC"]],
  });
}

async function listarPorEstado(estado) {
  return SolicitudPago.findAll({ where: { estado }, order: [["updatedAt", "ASC"]] });
}

async function obtenerPorId(id) {
  return SolicitudPago.findByPk(id);
}

/** Transición genérica: valida el estado actual esperado antes de avanzar. */
async function transicionar(id, estadoEsperado, cambios) {
  const solicitud = await obtenerPorId(id);
  if (!solicitud) return { error: `No existe la solicitud #${id}.` };

  const estados = Array.isArray(estadoEsperado) ? estadoEsperado : [estadoEsperado];
  if (!estados.includes(solicitud.estado)) {
    return {
      error: `La solicitud #${id} está en estado "${solicitud.estado}", no se puede aplicar esta acción todavía.`,
    };
  }

  await solicitud.update(cambios);
  logger.info("Solicitud de pago actualizada", { id, nuevoEstado: solicitud.estado });
  return { solicitud };
}

async function resolverAutorizacionExcepcional(
  id,
  { autorizado, autoridadTelegramId, autoridadNombre, motivoRechazo }
) {
  const solicitud = await obtenerPorId(id);
  if (!solicitud) return { error: `No existe la solicitud #${id}.` };
  if (solicitud.estado !== "pendiente_autorizacion_excepcional") {
    return { error: `La solicitud #${id} no está pendiente de autorización excepcional.` };
  }

  const cambios = {
    autorizacionExcepcional: !!autorizado,
    autorizadoExcepcionalPorTelegramId: String(autoridadTelegramId),
    autorizadoExcepcionalPorNombre: autoridadNombre,
    fechaAutorizacionExcepcional: new Date(),
    estado: autorizado ? "pendiente" : "rechazada",
    motivoRechazo: autorizado
      ? null
      : motivoRechazo?.trim() || "Solicitud excepcional del mismo día no autorizada.",
  };

  await solicitud.update(cambios);
  logger.info("Autorización excepcional resuelta", {
    id,
    autorizado: !!autorizado,
    autoridadNombre,
  });
  return { solicitud };
}

/** 1. Contadora confirma que la solicitud y documentación están completas. */
async function verificarCompra(id, fechaVerificacion = fechaHoyISO()) {
  const solicitud = await obtenerPorId(id);
  if (!solicitud) return { error: `No existe la solicitud #${id}.` };
  if (solicitud.estado !== "pendiente") {
    return {
      error: `La solicitud #${id} está en estado "${solicitud.estado}", no puede verificarse todavía.`,
    };
  }

  const comprobantes = await Comprobante.findAll({
    where: { solicitudPagoId: id },
    order: [["createdAt", "ASC"]],
  });
  const activos = comprobantes.filter((c) => c.estadoValidacion !== "rechazado");
  const pendientes = activos.filter((c) =>
    ["recibido", "pendiente_revision", "pendiente_liquidacion", "correccion_requerida"].includes(
      c.estadoValidacion
    )
  );
  const validados = activos.filter(
    (c) => c.estadoValidacion === "validado" && c.reconocidoParaPago
  );

  if (!comprobantes.length) {
    return {
      error:
        `La solicitud #${id} no tiene comprobantes vinculados. ` +
        `El solicitante debe registrarlos primero con /comprobante.`,
    };
  }
  if (pendientes.length) {
    const detalle = pendientes.map((c) => `#${c.id} (${c.estadoValidacion})`).join(", ");
    return {
      error:
        `La solicitud #${id} todavía tiene documentación pendiente: ${detalle}. ` +
        `Revisa el detalle con /documentos ${id}.`,
    };
  }
  if (!validados.length) {
    return {
      error:
        `La solicitud #${id} no tiene ningún comprobante validado y reconocido para pago. ` +
        `Revisa el detalle con /documentos ${id}.`,
    };
  }

  if (
    solicitud.tipo === "excepcional_mismo_dia" &&
    solicitud.autorizacionExcepcional &&
    fechaVerificacion !== solicitud.fechaDesembolsoRequerida
  ) {
    return {
      error:
        `La autorización excepcional #${id} era válida para ${solicitud.fechaDesembolsoRequerida}. ` +
        "Al haber cambiado el día, debe registrarse una nueva solicitud si el pago continúa siendo necesario.",
    };
  }

  const programacion = rules.calcularProgramacionPago({
    fechaCompleta: fechaVerificacion,
    fechaDesembolsoRequerida: solicitud.fechaDesembolsoRequerida,
    tipo: solicitud.tipo,
    autorizacionExcepcional: solicitud.autorizacionExcepcional,
  });

  await solicitud.update({
    estado: "verificada",
    fechaCompleta: fechaVerificacion,
    fechaProgramadaPago: programacion.fechaProgramadaPago,
    alcanzoCorteSemanal: programacion.alcanzoCorteSemanal,
    motivoReprogramacion: programacion.motivoReprogramacion,
  });

  logger.info("Solicitud verificada y programada", {
    id,
    fechaCompleta: fechaVerificacion,
    fechaProgramadaPago: programacion.fechaProgramadaPago,
    alcanzoCorteSemanal: programacion.alcanzoCorteSemanal,
  });

  return { solicitud, programacion };
}

/** 2. Contabilidad genera el reporte de detalle de pago para Colecturía. */
async function generarReporte(id) {
  return transicionar(id, "verificada", { estado: "reporte_generado" });
}

/** 3. Colecturía genera la orden de transferencia. */
async function generarOrdenTransferencia(id) {
  return transicionar(id, "reporte_generado", { estado: "orden_transferencia" });
}

/** 4a. Coordinador General aprueba la orden. */
async function aprobarComoCoordinadorGeneral(id) {
  const solicitud = await obtenerPorId(id);
  if (!solicitud || solicitud.estado !== "orden_transferencia") {
    return { error: `La solicitud #${id} no está lista para aprobación de Coordinación General.` };
  }
  const ambasAprobaciones = solicitud.aprobadoCashManagement;
  await solicitud.update({
    aprobadoCoordinadorGeneral: true,
    estado: ambasAprobaciones ? "aprobada" : solicitud.estado,
  });
  return { solicitud, completo: ambasAprobaciones };
}

/** 4b. Cash Management aprueba la orden. */
async function aprobarComoCashManagement(id) {
  const solicitud = await obtenerPorId(id);
  if (!solicitud || solicitud.estado !== "orden_transferencia") {
    return { error: `La solicitud #${id} no está lista para aprobación de Cash Management.` };
  }
  const ambasAprobaciones = solicitud.aprobadoCoordinadorGeneral;
  await solicitud.update({
    aprobadoCashManagement: true,
    estado: ambasAprobaciones ? "aprobada" : solicitud.estado,
  });
  return { solicitud, completo: ambasAprobaciones };
}

/** 5. Colecturía solo puede cerrar el pago un viernes y desde la fecha programada. */
async function marcarPagada(id, fechaPago = fechaHoyISO()) {
  const solicitud = await obtenerPorId(id);
  if (!solicitud) return { error: `No existe la solicitud #${id}.` };
  if (solicitud.estado !== "aprobada") {
    return { error: `La solicitud #${id} está en estado "${solicitud.estado}" y aún no puede pagarse.` };
  }
  if (!solicitud.fechaProgramadaPago) {
    return {
      error:
        `La solicitud #${id} no tiene fecha programada de pago. ` +
        "Debe volver a validarse/programarse antes de cerrar el pago.",
    };
  }

  const validacionPago = rules.validarEjecucionPago({
    fechaPago,
    fechaProgramadaPago: solicitud.fechaProgramadaPago,
    tipo: solicitud.tipo,
    autorizacionExcepcional: solicitud.autorizacionExcepcional,
  });
  if (!validacionPago.valido) return { error: validacionPago.motivo };

  return transicionar(id, "aprobada", { estado: "pagada" });
}

module.exports = {
  registrarSolicitud,
  listarPorSolicitante,
  listarPendientes,
  listarPorEstado,
  obtenerPorId,
  resolverAutorizacionExcepcional,
  verificarCompra,
  generarReporte,
  generarOrdenTransferencia,
  aprobarComoCoordinadorGeneral,
  aprobarComoCashManagement,
  marcarPagada,
};
