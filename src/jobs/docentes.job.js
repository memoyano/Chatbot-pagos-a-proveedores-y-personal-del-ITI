const cron = require("node-cron");
const { Op } = require("sequelize");
const facturaService = require("../domains/docentes/facturaDocente.service");
const FacturaDocente = require("../domains/docentes/facturaDocente.model");
const notificacionService = require("../domains/notificaciones/notificacion.service");
const { registrarAuditoria } = require("../domains/auditoria/auditoria.service");
const { runAsSystem } = require("../domains/auditoria/auditoria.context");
const recordatorios = require("../rules/recordatorios.rules");
const logger = require("../utils/logger");
const { DEFAULT_TIMEZONE, fechaHoyISO } = require("../utils/fechas");
const status = require("./status");

async function ejecutarVencimientosDocentes(bot) {
  return runAsSystem(async () => {
    const vencidas = await facturaService.marcarVencidasComoRezagadas();
    if (!vencidas.length) return 0;

    const porRol = new Map();
    for (const r of vencidas) {
      if (!porRol.has(r.rolPagoId)) porRol.set(r.rolPagoId, []);
      porRol.get(r.rolPagoId).push(r.docenteCedula);
    }

    for (const [rolId, cedulas] of porRol) {
      const mensaje =
        `⏰ Venció el plazo de factura para ${cedulas.length} docente(s) del rol #${rolId}.\n` +
        `Quedaron rezagados para el rol actual. Revisa /rezagados ${rolId}.`;
      await notificacionService.enviarPorRolUnaVez({
        bot, rol: "contadora", mensaje, tipo: "recordatorio_factura_docente", claveBase: `docentes-vencidos:${rolId}:${fechaHoyISO()}:contadora`, entidad: "RolPagoDocentes", entidadId: rolId,
      });
      await notificacionService.enviarPorRolUnaVez({
        bot, rol: "asistente_contable", mensaje, tipo: "recordatorio_factura_docente", claveBase: `docentes-vencidos:${rolId}:${fechaHoyISO()}:asistente`, entidad: "RolPagoDocentes", entidadId: rolId,
      });
    }

    await registrarAuditoria({ entidad: "Automatizacion", entidadId: fechaHoyISO(), accion: "VENCIMIENTOS_DOCENTES", detalle: { cantidad: vencidas.length } });
    logger.info("Vencimientos de facturas docentes procesados", { cantidad: vencidas.length });
    return vencidas.length;
  }, { nombre: "Job vencimientos docentes", rol: "sistema" });
}

async function ejecutarRecordatoriosDocentes(bot, hoy = fechaHoyISO()) {
  return runAsSystem(async () => {
    const registros = await FacturaDocente.findAll({
      where: {
        estado: { [Op.in]: ["pendiente", "con_error"] },
        fechaLimiteFactura: { [Op.ne]: null },
      },
      order: [["fechaLimiteFactura", "ASC"]],
    });
    const porRol = new Map();
    for (const r of registros) {
      if (!recordatorios.debeRecordarFacturaDocente({ fechaReferencia: hoy, fechaLimite: r.fechaLimiteFactura, estado: r.estado })) continue;
      if (!porRol.has(r.rolPagoId)) porRol.set(r.rolPagoId, []);
      porRol.get(r.rolPagoId).push(r);
    }

    let enviados = 0;
    for (const [rolId, items] of porRol) {
      const resumen = items.map((r) => `${r.docenteCedula} (vence ${r.fechaLimiteFactura})`).join(", ");
      const mensaje = `📨 Facturas docentes próximas a vencer — rol #${rolId}: ${resumen}. Revisa /resumenrol ${rolId}.`;
      const c = await notificacionService.enviarPorRolUnaVez({
        bot, rol: "contadora", mensaje, tipo: "recordatorio_factura_docente", claveBase: `docentes-recordatorio:${rolId}:${hoy}:contadora`, entidad: "RolPagoDocentes", entidadId: rolId,
      });
      const a = await notificacionService.enviarPorRolUnaVez({
        bot, rol: "asistente_contable", mensaje, tipo: "recordatorio_factura_docente", claveBase: `docentes-recordatorio:${rolId}:${hoy}:asistente`, entidad: "RolPagoDocentes", entidadId: rolId,
      });
      enviados += c.enviados + a.enviados;
    }
    if (enviados) await registrarAuditoria({ entidad: "Automatizacion", entidadId: hoy, accion: "RECORDATORIOS_DOCENTES", detalle: { enviados } });
    return enviados;
  }, { nombre: "Job recordatorios docentes", rol: "sistema" });
}

function iniciarJobDocentes(bot) {
  const tareas = [];
  const vencimientosSchedule = "5 * * * *";
  status.registrarProgramado("vencimientos_docentes", vencimientosSchedule);
  const vencimientos = cron.schedule(vencimientosSchedule, async () => {
    const nombre = "vencimientos_docentes";
    status.registrarInicio(nombre, vencimientosSchedule);
    try {
      const cantidad = await ejecutarVencimientosDocentes(bot);
      status.registrarExito(nombre, { cantidad });
    } catch (error) {
      status.registrarError(nombre, error);
      logger.error("Error en job de vencimientos docentes", { error: error.message, stack: error.stack });
    }
  }, { timezone: DEFAULT_TIMEZONE });
  tareas.push(vencimientos);

  const recordatoriosSchedule = "0 8 * * *";
  status.registrarProgramado("recordatorios_docentes", recordatoriosSchedule);
  const recordatoriosTask = cron.schedule(recordatoriosSchedule, async () => {
    const nombre = "recordatorios_docentes";
    status.registrarInicio(nombre, recordatoriosSchedule);
    try {
      const enviados = await ejecutarRecordatoriosDocentes(bot);
      status.registrarExito(nombre, { enviados });
    } catch (error) {
      status.registrarError(nombre, error);
      logger.error("Error en recordatorios docentes", { error: error.message, stack: error.stack });
    }
  }, { timezone: DEFAULT_TIMEZONE });
  tareas.push(recordatoriosTask);

  logger.info("Jobs docentes iniciados", { timezone: DEFAULT_TIMEZONE });
  return tareas;
}

module.exports = { iniciarJobDocentes, ejecutarVencimientosDocentes, ejecutarRecordatoriosDocentes };
