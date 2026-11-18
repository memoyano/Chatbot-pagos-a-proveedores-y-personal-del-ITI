const Comprobante = require("./comprobante.model");
const SolicitudPago = require("../solicitudesPago/solicitudPago.model");
const rules = require("../../rules/politicaPagos.rules");
const { fechaHoyISO } = require("../../utils/fechas");
const logger = require("../../utils/logger");

function resultadoDocumental(comprobanteLike) {
  const c = comprobanteLike.dataValues || comprobanteLike;
  return rules.validarRequisitosDocumentalesComprobante(c);
}


async function validarSolicitudVinculable({ solicitudPagoId, solicitanteTelegramId }) {
  const solicitud = await SolicitudPago.findByPk(solicitudPagoId);
  if (!solicitud) return { error: `No existe la solicitud #${solicitudPagoId}.` };
  if (String(solicitud.solicitanteTelegramId) !== String(solicitanteTelegramId)) {
    return { error: `La solicitud #${solicitudPagoId} no pertenece al usuario autenticado.` };
  }
  if (!["pendiente_autorizacion_excepcional", "pendiente"].includes(solicitud.estado)) {
    return {
      error:
        `La solicitud #${solicitudPagoId} está en estado "${solicitud.estado}" y ya no admite nuevos comprobantes. ` +
        `La documentación debe quedar cerrada antes de /verificar.`,
    };
  }
  return { solicitud };
}

async function registrarComprobante({
  solicitudPagoId,
  tipo,
  fechaCompra,
  fechaEnvio,
  rutaArchivo,
  esCompraTarjetaInstitucional,
  rutaRespaldoTarjeta,
  esCompraInternet,
  tipoRespaldoInternet,
  rutaRespaldoInternet,
  proveedorCedula,
  rutaCedulaProveedor,
  notaVentaRimpeNegocioPopular,
  notaVentaEmitidaNombreITI,
  notaVentaRucAplica,
  notaVentaRucInstitucional,
  notaVentaLegible,
  notaVentaSinEnmendaduras,
  notaVentaDatosCompletos,
  solicitanteTelegramId,
  solicitanteNombre,
}) {
  const vinculacion = await validarSolicitudVinculable({
    solicitudPagoId,
    solicitanteTelegramId,
  });
  if (vinculacion.error) return { error: vinculacion.error };

  const evaluacion = rules.evaluarComprobante({
    tipo,
    fechaCompra,
    fechaEnvio,
    esCompraTarjetaInstitucional: !!esCompraTarjetaInstitucional,
  });

  const base = {
    solicitudPagoId,
    tipo,
    fechaCompra,
    fechaEnvio,
    rutaArchivo: rutaArchivo || null,
    esCompraTarjetaInstitucional: !!esCompraTarjetaInstitucional,
    rutaRespaldoTarjeta: rutaRespaldoTarjeta || null,
    esCompraInternet: !!esCompraInternet,
    tipoRespaldoInternet: tipoRespaldoInternet || null,
    rutaRespaldoInternet: rutaRespaldoInternet || null,
    proveedorCedula: proveedorCedula || null,
    rutaCedulaProveedor: rutaCedulaProveedor || null,
    notaVentaRimpeNegocioPopular,
    notaVentaEmitidaNombreITI,
    notaVentaRucAplica,
    notaVentaRucInstitucional,
    notaVentaLegible,
    notaVentaSinEnmendaduras,
    notaVentaDatosCompletos,
    solicitanteTelegramId,
    solicitanteNombre,
    cumplePoliticaAutomatica: evaluacion.reconocido,
    reconocidoParaPago: false,
    documentacionCompleta: false,
    cumplePlazoEnvio: evaluacion.cumplePlazoEnvio,
    cumpleCierreContable: evaluacion.cumpleCierreContable,
    fechaLimiteCierre: evaluacion.fechaLimiteCierre,
    motivoNoReconocimiento: evaluacion.motivo,
    estadoValidacion: tipo === "liquidacion_compra" ? "pendiente_liquidacion" : "pendiente_revision",
  };

  const documental = resultadoDocumental(base);
  base.documentacionCompleta = documental.completa;

  const comprobante = await Comprobante.create(base);

  logger.info("Comprobante registrado y vinculado", {
    id: comprobante.id,
    solicitudPagoId,
    estadoValidacion: comprobante.estadoValidacion,
    cumplePoliticaAutomatica: evaluacion.reconocido,
  });

  return { comprobante, evaluacion, documental };
}

async function obtenerPorId(id) {
  return Comprobante.findByPk(id);
}

async function listarPorSolicitud(solicitudPagoId) {
  return Comprobante.findAll({
    where: { solicitudPagoId },
    order: [["createdAt", "ASC"]],
  });
}

async function listarPorProveedor(cedulaRuc) {
  return Comprobante.findAll({
    where: { proveedorCedula: cedulaRuc },
    order: [["createdAt", "DESC"]],
    limit: 10,
  });
}

async function registrarLiquidacionEmitida(
  id,
  { fechaLiquidacionCompra, rutaLiquidacionCompra, contadoraTelegramId, contadoraNombre }
) {
  const comprobante = await obtenerPorId(id);
  if (!comprobante) return { error: `No existe el comprobante #${id}.` };
  if (comprobante.tipo !== "liquidacion_compra") {
    return { error: `El comprobante #${id} no corresponde a una Liquidación de Compra.` };
  }
  if (["validado", "rechazado"].includes(comprobante.estadoValidacion)) {
    return { error: `El comprobante #${id} está en estado "${comprobante.estadoValidacion}".` };
  }

  const cumpleMismoDia = String(fechaLiquidacionCompra) === String(comprobante.fechaCompra);
  const cambios = {
    fechaLiquidacionCompra,
    rutaLiquidacionCompra,
    estadoValidacion: cumpleMismoDia ? "pendiente_revision" : "correccion_requerida",
    observacionValidacion: cumpleMismoDia
      ? null
      : `La Liquidación de Compra debía elaborarse el mismo día de la compra (${comprobante.fechaCompra}).`,
  };

  const documental = resultadoDocumental({ ...comprobante.dataValues, ...cambios });
  cambios.documentacionCompleta = documental.completa;
  await comprobante.update(cambios);

  logger.info("Liquidación de Compra adjuntada", {
    id,
    fechaLiquidacionCompra,
    contadoraTelegramId,
    contadoraNombre,
    cumpleMismoDia,
  });
  return { comprobante, documental };
}

async function marcarOriginalNotaVentaEntregado(
  id,
  { fechaEntrega = fechaHoyISO(), contadoraTelegramId, contadoraNombre }
) {
  const comprobante = await obtenerPorId(id);
  if (!comprobante) return { error: `No existe el comprobante #${id}.` };
  if (comprobante.tipo !== "nota_venta") {
    return { error: `El comprobante #${id} no es una Nota de Venta.` };
  }

  const cumplePlazo =
    !comprobante.fechaLimiteCierre || String(fechaEntrega) <= String(comprobante.fechaLimiteCierre);
  await comprobante.update({
    notaVentaOriginalEntregado: true,
    fechaEntregaOriginalNotaVenta: fechaEntrega,
    notaVentaOriginalCumplePlazo: cumplePlazo,
  });
  logger.info("Original de Nota de Venta recibido", {
    id,
    fechaEntrega,
    cumplePlazo,
    contadoraTelegramId,
    contadoraNombre,
  });
  return { comprobante, cumplePlazo };
}

async function validarPorContabilidad(
  id,
  { contadoraTelegramId, contadoraNombre, observacion = null }
) {
  const comprobante = await obtenerPorId(id);
  if (!comprobante) return { error: `No existe el comprobante #${id}.` };
  if (comprobante.estadoValidacion === "rechazado") {
    return { error: `El comprobante #${id} fue rechazado y no puede validarse.` };
  }

  const documental = resultadoDocumental(comprobante);
  if (!documental.completa) {
    return {
      error: `La documentación está incompleta: ${documental.faltantes.join(", ")}.`,
      comprobante,
    };
  }
  if (!comprobante.cumplePoliticaAutomatica) {
    return {
      error:
        `El comprobante no cumple las reglas automáticas de plazo/cierre: ` +
        `${comprobante.motivoNoReconocimiento || "incumplimiento de política"}.`,
      comprobante,
    };
  }

  await comprobante.update({
    documentacionCompleta: true,
    reconocidoParaPago: true,
    estadoValidacion: "validado",
    observacionValidacion: observacion || null,
    validadoPorTelegramId: String(contadoraTelegramId),
    validadoPorNombre: contadoraNombre,
    fechaValidacion: new Date(),
    motivoNoReconocimiento: null,
  });
  logger.info("Comprobante validado por Contabilidad", { id, contadoraNombre });
  return { comprobante };
}

async function observarPorContabilidad(
  id,
  { motivo, contadoraTelegramId, contadoraNombre }
) {
  const comprobante = await obtenerPorId(id);
  if (!comprobante) return { error: `No existe el comprobante #${id}.` };
  if (!motivo?.trim()) return { error: "Debes indicar el motivo de la observación." };
  if (comprobante.estadoValidacion === "validado") {
    return { error: `El comprobante #${id} ya fue validado.` };
  }

  await comprobante.update({
    reconocidoParaPago: false,
    estadoValidacion: "correccion_requerida",
    observacionValidacion: motivo.trim(),
    validadoPorTelegramId: String(contadoraTelegramId),
    validadoPorNombre: contadoraNombre,
    fechaValidacion: new Date(),
  });
  return { comprobante };
}

async function rechazarPorContabilidad(
  id,
  { motivo, contadoraTelegramId, contadoraNombre }
) {
  const comprobante = await obtenerPorId(id);
  if (!comprobante) return { error: `No existe el comprobante #${id}.` };
  if (!motivo?.trim()) return { error: "Debes indicar el motivo del rechazo." };

  await comprobante.update({
    reconocidoParaPago: false,
    estadoValidacion: "rechazado",
    observacionValidacion: motivo.trim(),
    validadoPorTelegramId: String(contadoraTelegramId),
    validadoPorNombre: contadoraNombre,
    fechaValidacion: new Date(),
  });
  return { comprobante };
}

async function resumenDocumentacionSolicitud(solicitudPagoId) {
  const comprobantes = await listarPorSolicitud(solicitudPagoId);
  const activos = comprobantes.filter((c) => c.estadoValidacion !== "rechazado");
  const pendientes = activos.filter((c) =>
    ["recibido", "pendiente_revision", "pendiente_liquidacion", "correccion_requerida"].includes(
      c.estadoValidacion
    )
  );
  const validados = activos.filter(
    (c) => c.estadoValidacion === "validado" && c.reconocidoParaPago
  );

  return {
    comprobantes,
    activos,
    pendientes,
    validados,
    listoParaVerificar: validados.length > 0 && pendientes.length === 0,
  };
}

module.exports = {
  registrarComprobante,
  validarSolicitudVinculable,
  resultadoDocumental,
  obtenerPorId,
  listarPorSolicitud,
  listarPorProveedor,
  registrarLiquidacionEmitida,
  marcarOriginalNotaVentaEntregado,
  validarPorContabilidad,
  observarPorContabilidad,
  rechazarPorContabilidad,
  resumenDocumentacionSolicitud,
};
