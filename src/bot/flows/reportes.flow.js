const { requireRol } = require("../middlewares/auth.middleware");
const { generarResumenOperativo } = require("../../domains/reportes/reporteOperativo.service");
const { normalizarPeriodo, formatearResumenTelegram } = require("../../rules/reportes.rules");

const ROLES = ["contadora", "director_general", "coordinador_general"];

module.exports = function registerReportesFlow(bot) {
  bot.command("resumenoperativo", requireRol(...ROLES), async (ctx) => {
    try {
      const arg = (ctx.message.text.split(/\s+/)[1] || "").trim();
      const periodo = normalizarPeriodo(arg || undefined);
      const reporte = await generarResumenOperativo(periodo);
      return ctx.reply(formatearResumenTelegram(reporte));
    } catch (error) {
      return ctx.reply(`⚠️ No se pudo generar el resumen: ${error.message}`);
    }
  });

  bot.command("pendientescriticos", requireRol(...ROLES), async (ctx) => {
    try {
      const arg = (ctx.message.text.split(/\s+/)[1] || "").trim();
      const periodo = normalizarPeriodo(arg || undefined);
      const r = await generarResumenOperativo(periodo);
      return ctx.reply(
        `⚠️ Pendientes críticos — ${periodo}\n\n` +
        `Pagos pendientes/en proceso: ${r.pagos.pendientes + r.pagos.enProceso}\n` +
        `Documentos pendientes/corrección: ${r.documentos.pendientes + r.documentos.correccionRequerida}\n` +
        `Caja Chica pendiente: ${r.cajaChica.pendientesRevision}\n` +
        `Eventos pendientes: ${r.eventos.pendientesRevision}\n` +
        `Facturas docentes pendientes/error/rezagadas: ${r.docentes.facturasPendientes + r.docentes.facturasConError + r.docentes.facturasRezagadas}\n` +
        `Fallos operativos: ${r.operacion.notificacionesFallidas + r.operacion.telegramUpdatesFallidos}\n\n` +
        `Total agregado: ${r.pendientesCriticos}`
      );
    } catch (error) {
      return ctx.reply(`⚠️ No se pudo consultar pendientes: ${error.message}`);
    }
  });
};
