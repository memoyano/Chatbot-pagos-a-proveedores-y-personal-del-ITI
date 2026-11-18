const { Op } = require("sequelize");
const SolicitudPago = require("../solicitudesPago/solicitudPago.model");
const Comprobante = require("../comprobantes/comprobante.model");
const ReembolsoCajaChica = require("../cajaChica/reembolsoCajaChica.model");
const EventoInstitucional = require("../eventos/eventoInstitucional.model");
const RolPagoDocentes = require("../docentes/rolPago.model");
const FacturaDocente = require("../docentes/facturaDocente.model");
const Notificacion = require("../notificaciones/notificacion.model");
const TelegramUpdate = require("../runtime/telegramUpdate.model");
const {
  normalizarPeriodo,
  limitesPeriodoDateOnly,
  limitesPeriodoUtcEcuador,
  totalPendientesCriticos,
} = require("../../rules/reportes.rules");

async function contarPorEstado(model, whereBase, estado, campo = "estado") {
  return model.count({ where: { ...whereBase, [campo]: estado } });
}

async function generarResumenOperativo(periodoEntrada) {
  const periodo = normalizarPeriodo(periodoEntrada);
  const { inicio, finExclusivo } = limitesPeriodoDateOnly(periodo);
  const utc = limitesPeriodoUtcEcuador(periodo);

  const pagosWhere = { fechaSolicitud: { [Op.gte]: inicio, [Op.lt]: finExclusivo } };
  const docsWhere = { fechaEnvio: { [Op.gte]: inicio, [Op.lt]: finExclusivo } };
  const cajaWhere = { periodoPresentacion: periodo };
  const eventosWhere = { fechaPresentacion: { [Op.gte]: inicio, [Op.lt]: finExclusivo } };
  const rolesWhere = { fechaMatricesRecibidas: { [Op.gte]: inicio, [Op.lt]: finExclusivo } };
  const timestampWhere = { [Op.gte]: utc.inicio, [Op.lt]: utc.finExclusivo };

  const [
    pagosTotal,
    pagosPendientes,
    pagosRechazados,
    pagosVerificados,
    pagosReporte,
    pagosOrden,
    pagosAprobados,
    pagosPagados,
    montoRegistrado,
    montoPagadoAproximado,
    docsTotal,
    docsValidados,
    docsPendientesRevision,
    docsPendientesLiquidacion,
    docsCorreccion,
    docsRechazados,
    cajaTotal,
    cajaPendientes,
    cajaAprobados,
    cajaReembolsados,
    cajaDiferidos,
    cajaMonto,
    eventosTotal,
    eventosPendientes,
    eventosObservados,
    eventosAprobados,
    eventosRechazados,
    rolesTotal,
    rolesPagados,
    facturasPendientes,
    facturasError,
    facturasRezagadas,
    facturasPagadas,
    notifFallidas,
    telegramFallidos,
  ] = await Promise.all([
    SolicitudPago.count({ where: pagosWhere }),
    SolicitudPago.count({ where: { ...pagosWhere, estado: { [Op.in]: ["pendiente", "pendiente_autorizacion_excepcional"] } } }),
    contarPorEstado(SolicitudPago, pagosWhere, "rechazada"),
    contarPorEstado(SolicitudPago, pagosWhere, "verificada"),
    contarPorEstado(SolicitudPago, pagosWhere, "reporte_generado"),
    contarPorEstado(SolicitudPago, pagosWhere, "orden_transferencia"),
    contarPorEstado(SolicitudPago, pagosWhere, "aprobada"),
    contarPorEstado(SolicitudPago, pagosWhere, "pagada"),
    SolicitudPago.sum("montoAproximado", { where: pagosWhere }),
    SolicitudPago.sum("montoAproximado", { where: { ...pagosWhere, estado: "pagada" } }),
    Comprobante.count({ where: docsWhere }),
    contarPorEstado(Comprobante, docsWhere, "validado", "estadoValidacion"),
    contarPorEstado(Comprobante, docsWhere, "pendiente_revision", "estadoValidacion"),
    contarPorEstado(Comprobante, docsWhere, "pendiente_liquidacion", "estadoValidacion"),
    contarPorEstado(Comprobante, docsWhere, "correccion_requerida", "estadoValidacion"),
    contarPorEstado(Comprobante, docsWhere, "rechazado", "estadoValidacion"),
    ReembolsoCajaChica.count({ where: cajaWhere }),
    contarPorEstado(ReembolsoCajaChica, cajaWhere, "pendiente_revision"),
    contarPorEstado(ReembolsoCajaChica, cajaWhere, "aprobado"),
    contarPorEstado(ReembolsoCajaChica, cajaWhere, "reembolsado"),
    ReembolsoCajaChica.count({ where: { ...cajaWhere, diferido: true } }),
    ReembolsoCajaChica.sum("montoTotal", { where: cajaWhere }),
    EventoInstitucional.count({ where: eventosWhere }),
    contarPorEstado(EventoInstitucional, eventosWhere, "pendiente_revision"),
    contarPorEstado(EventoInstitucional, eventosWhere, "observado"),
    contarPorEstado(EventoInstitucional, eventosWhere, "aprobado_programacion"),
    contarPorEstado(EventoInstitucional, eventosWhere, "rechazado"),
    RolPagoDocentes.count({ where: rolesWhere }),
    contarPorEstado(RolPagoDocentes, rolesWhere, "pagado"),
    FacturaDocente.count({ where: { createdAt: timestampWhere, estado: { [Op.in]: ["preparacion", "pendiente"] } } }),
    FacturaDocente.count({ where: { createdAt: timestampWhere, estado: "con_error" } }),
    FacturaDocente.count({ where: { createdAt: timestampWhere, estado: "rezagada" } }),
    FacturaDocente.count({ where: { createdAt: timestampWhere, estado: "pagada" } }),
    Notificacion.count({ where: { creadoEn: timestampWhere, estado: "error" } }),
    TelegramUpdate.count({ where: { createdAt: timestampWhere, status: "failed" } }),
  ]);

  const reporte = {
    periodo,
    generadoEn: new Date().toISOString(),
    pagos: {
      total: pagosTotal,
      pendientes: pagosPendientes,
      enProceso: pagosVerificados + pagosReporte + pagosOrden + pagosAprobados,
      rechazadas: pagosRechazados,
      pagadas: pagosPagados,
      montoRegistrado: Number(montoRegistrado || 0),
      montoPagadoAproximado: Number(montoPagadoAproximado || 0),
    },
    documentos: {
      total: docsTotal,
      validados: docsValidados,
      pendientes: docsPendientesRevision + docsPendientesLiquidacion,
      pendientesRevision: docsPendientesRevision,
      pendientesLiquidacion: docsPendientesLiquidacion,
      correccionRequerida: docsCorreccion,
      rechazados: docsRechazados,
    },
    cajaChica: {
      total: cajaTotal,
      pendientesRevision: cajaPendientes,
      aprobados: cajaAprobados,
      reembolsados: cajaReembolsados,
      diferidos: cajaDiferidos,
      montoPresentado: Number(cajaMonto || 0),
    },
    eventos: {
      total: eventosTotal,
      pendientesRevision: eventosPendientes + eventosObservados,
      aprobados: eventosAprobados,
      rechazados: eventosRechazados,
    },
    docentes: {
      roles: rolesTotal,
      rolesPagados,
      facturasPendientes,
      facturasConError: facturasError,
      facturasRezagadas,
      facturasPagadas,
    },
    operacion: {
      notificacionesFallidas: notifFallidas,
      telegramUpdatesFallidos: telegramFallidos,
    },
  };
  reporte.pendientesCriticos = totalPendientesCriticos(reporte);
  return reporte;
}

module.exports = { generarResumenOperativo };
