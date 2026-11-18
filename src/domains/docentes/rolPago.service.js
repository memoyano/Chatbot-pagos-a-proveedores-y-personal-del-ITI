const { Op } = require("sequelize");
const RolPagoDocentes = require("./rolPago.model");
const FacturaDocente = require("./facturaDocente.model");
const Docente = require("./docente.model");
const facturaService = require("./facturaDocente.service");
const { enviarSolicitudFacturaDocente } = require("../../utils/mailer");
const { fechaHoyISO } = require("../../utils/fechas");
const rules = require("../../rules/politicaDocentes.rules");
const logger = require("../../utils/logger");

async function iniciarRol({ periodo, creadoPorTelegramId }) {
  const rol = await RolPagoDocentes.create({
    periodo,
    fechaMatricesRecibidas: fechaHoyISO(),
    estado: "matrices_recibidas",
    creadoPorTelegramId,
  });
  logger.info("Rol de pago docentes iniciado", { id: rol.id, periodo });
  return rol;
}

async function transicionar(id, estadoEsperado, cambios) {
  const rol = await RolPagoDocentes.findByPk(id);
  if (!rol) return { error: `No existe el rol de pago #${id}.` };
  const esperados = Array.isArray(estadoEsperado) ? estadoEsperado : [estadoEsperado];
  if (!esperados.includes(rol.estado)) {
    return { error: `El rol #${id} está en estado "${rol.estado}", no se puede aplicar esta acción todavía.` };
  }
  await rol.update(cambios);
  return { rol };
}

async function elaborarRol(id) {
  return transicionar(id, "matrices_recibidas", {
    estado: "rol_elaborado",
    fechaRolElaborado: new Date(),
  });
}

async function solicitarFacturas(id, enviarCorreo = enviarSolicitudFacturaDocente) {
  const rol = await RolPagoDocentes.findByPk(id);
  if (!rol) return { error: `No existe el rol de pago #${id}.` };
  if (!['rol_elaborado', 'facturas_solicitadas'].includes(rol.estado)) {
    return { error: `El rol #${id} está en estado "${rol.estado}" y no admite envío de solicitudes de factura.` };
  }

  const registros = await FacturaDocente.findAll({ where: { rolPagoId: id } });
  if (!registros.length) {
    return {
      error:
        `El rol #${id} no tiene docentes configurados. ` +
        `Usa /configurarfactura ${id} <cedula> <monto> <concepto> para cada docente incluido en las matrices.`,
    };
  }

  const pendientesEnvio = registros.filter((r) => r.correoEstado !== "enviado");
  if (!pendientesEnvio.length) {
    const fechaLimite = registros[0]?.fechaLimiteFactura || null;
    return { rol, docentesNotificados: 0, yaEnviadas: registros.length, fallidos: [], fechaLimite };
  }

  const hoy = fechaHoyISO();
  const fechaLimite = rules.calcularFechaLimiteFactura(hoy);
  let enviados = 0;
  const fallidos = [];

  for (const registro of pendientesEnvio) {
    if (!registro.conceptoSolicitado || registro.montoSolicitado === null) {
      fallidos.push({ docenteCedula: registro.docenteCedula, error: "Falta concepto o monto solicitado" });
      continue;
    }

    const docente = await Docente.findByPk(registro.docenteCedula);
    if (!docente || !docente.activo) {
      fallidos.push({ docenteCedula: registro.docenteCedula, error: "Docente inexistente o inactivo" });
      continue;
    }

    try {
      const resultado = await enviarCorreo({
        correoElectronico: docente.correoElectronico,
        nombre: docente.nombre,
        periodo: rol.periodo,
        conceptoSolicitado: registro.conceptoSolicitado,
        montoSolicitado: registro.montoSolicitado,
        fechaLimite,
      });

      if (!resultado.enviado) {
        await registro.update({ correoEstado: "error", correoError: resultado.error || "Correo no enviado" });
        fallidos.push({ docenteCedula: docente.cedula, error: resultado.error || "Correo no enviado" });
        continue;
      }

      await registro.update({
        fechaSolicitudFactura: hoy,
        fechaLimiteFactura: fechaLimite,
        correoEstado: "enviado",
        correoEnviadoEn: new Date(),
        correoError: null,
        estado: "pendiente",
      });
      enviados += 1;
    } catch (error) {
      await registro.update({ correoEstado: "error", correoError: error.message });
      fallidos.push({ docenteCedula: registro.docenteCedula, error: error.message });
      logger.warn("No se pudo enviar solicitud de factura docente", {
        rolId: id,
        docenteCedula: registro.docenteCedula,
        error: error.message,
      });
    }
  }

  const enviadosTotales = await FacturaDocente.count({ where: { rolPagoId: id, correoEstado: "enviado" } });
  if (enviadosTotales > 0) {
    await rol.update({
      estado: "facturas_solicitadas",
      fechaFacturasSolicitadas: rol.fechaFacturasSolicitadas || hoy,
    });
  }

  logger.info("Solicitudes de factura procesadas", { rolId: id, enviados, fallidos: fallidos.length });
  return { rol, docentesNotificados: enviados, yaEnviadas: enviadosTotales - enviados, fallidos, fechaLimite };
}

async function obtenerPorId(id) {
  return RolPagoDocentes.findByPk(id);
}

async function marcarDocumentacionRevisada(id) {
  const rol = await RolPagoDocentes.findByPk(id);
  if (!rol) return { error: `No existe el rol de pago #${id}.` };
  if (rol.estado !== "facturas_solicitadas") {
    return { error: `El rol #${id} está en estado "${rol.estado}".` };
  }

  const bloqueantes = await facturaService.pendientesQueBloqueanRevision(id);
  if (bloqueantes.length) {
    return {
      error:
        `Aún hay ${bloqueantes.length} factura(s) pendientes, en preparación o con corrección abierta. ` +
        `Usa /resumenrol ${id} para revisar el detalle.`,
    };
  }

  await rol.update({ estado: "documentacion_revisada", fechaDocumentacionRevisada: new Date() });
  return { rol };
}

async function generarDetalle(id) {
  return transicionar(id, "documentacion_revisada", { estado: "detalle_generado" });
}

async function generarOrden(id) {
  return transicionar(id, "detalle_generado", { estado: "orden_generada" });
}

async function marcarPagado(id) {
  const { rol, error } = await transicionar(id, "orden_generada", { estado: "pagado" });
  if (error) return { error };

  await FacturaDocente.update(
    { estado: "pagada", pagadaEnCierreSemestre: false },
    { where: { rolPagoId: id, estado: "recibida" } }
  );
  return { rol };
}

async function prepararPagoRezagados(id) {
  const rol = await RolPagoDocentes.findByPk(id);
  if (!rol) return { error: `No existe el rol de pago #${id}.` };
  if (rol.estado !== "pagado") {
    return { error: "El rol ordinario debe estar pagado antes de preparar rezagados de fin de semestre." };
  }
  if (rol.pagoRezagadosEstado !== "no_iniciado") {
    return { error: `El pago de rezagados ya está en estado "${rol.pagoRezagadosEstado}".` };
  }

  const listos = await facturaService.rezagadosListosParaPago(id);
  if (!listos.length) {
    return { error: "No hay docentes rezagados con factura correcta lista para pago de fin de semestre." };
  }

  await rol.update({ pagoRezagadosEstado: "preparado", fechaPreparacionRezagados: new Date() });
  return { rol, cantidad: listos.length };
}

async function generarOrdenRezagados(id) {
  const rol = await RolPagoDocentes.findByPk(id);
  if (!rol) return { error: `No existe el rol de pago #${id}.` };
  if (rol.pagoRezagadosEstado !== "preparado") {
    return { error: `El pago de rezagados está en estado "${rol.pagoRezagadosEstado}".` };
  }
  await rol.update({ pagoRezagadosEstado: "orden_generada", fechaOrdenRezagados: new Date() });
  return { rol };
}

async function pagarRezagados(id) {
  const rol = await RolPagoDocentes.findByPk(id);
  if (!rol) return { error: `No existe el rol de pago #${id}.` };
  if (rol.pagoRezagadosEstado !== "orden_generada") {
    return { error: `El pago de rezagados está en estado "${rol.pagoRezagadosEstado}".` };
  }

  const listos = await facturaService.rezagadosListosParaPago(id);
  if (!listos.length) return { error: "Ya no hay docentes rezagados listos para pago." };
  const hoy = fechaHoyISO();
  await FacturaDocente.update(
    { estado: "pagada", pagadaEnCierreSemestre: true, fechaPagoFinalSemestre: hoy },
    {
      where: {
        rolPagoId: id,
        estado: "rezagada",
        elegiblePagoFinSemestre: true,
      },
    }
  );
  await rol.update({ pagoRezagadosEstado: "pagado", fechaPagoRezagados: new Date() });
  return { rol, cantidad: listos.length };
}

module.exports = {
  iniciarRol,
  elaborarRol,
  solicitarFacturas,
  marcarDocumentacionRevisada,
  generarDetalle,
  generarOrden,
  marcarPagado,
  prepararPagoRezagados,
  generarOrdenRezagados,
  pagarRezagados,
  obtenerPorId,
};
