const { requireRol } = require("../middlewares/auth.middleware");
const status = require("../../jobs/status");
const { ejecutarRecordatoriosTransversales } = require("../../jobs/transversales.job");
const { ejecutarRecordatoriosDocentes } = require("../../jobs/docentes.job");
const Notificacion = require("../../domains/notificaciones/notificacion.model");

function registerAutomatizacionesFlow(bot) {
  bot.command("automatizaciones", requireRol("contadora", "director_general"), async (ctx) => {
    const estados = status.obtenerEstados();
    if (!estados.length) return ctx.reply("No hay jobs registrados en esta instancia.");
    const texto = estados.map((j) => {
      const ultimo = j.lastSuccessAt || "aún no ejecutado";
      const error = j.lastError ? `\n   ❌ ${j.lastError}` : "";
      return `• ${j.nombre}\n   cron: ${j.schedule}\n   último OK: ${ultimo}${error}`;
    }).join("\n\n");
    return ctx.reply(`⚙️ Automatizaciones activas:\n\n${texto}`);
  });

  bot.command("recordatoriosahora", requireRol("contadora", "director_general"), async (ctx) => {
    const transversal = await ejecutarRecordatoriosTransversales(bot);
    const docentes = await ejecutarRecordatoriosDocentes(bot);
    return ctx.reply(
      `✅ Barrido manual completado.\n` +
      `Recordatorios transversales enviados: ${transversal.total}.\n` +
      `Recordatorios docentes enviados: ${docentes}.\n` +
      `Los recordatorios ya enviados hoy no se duplican.`
    );
  });

  bot.command("notificacionesfallidas", requireRol("contadora", "director_general"), async (ctx) => {
    const fallidas = await Notificacion.findAll({
      where: { estado: "error" },
      order: [["creadoEn", "DESC"]],
      limit: 15,
    });
    if (!fallidas.length) return ctx.reply("✅ No hay notificaciones fallidas registradas.");
    const texto = fallidas.map((n) =>
      `#${n.id} ${n.tipo} → ${n.destinatarioTelegramId}\n${(n.error || "error no especificado").slice(0, 180)}`
    ).join("\n\n");
    return ctx.reply(`⚠️ Últimas notificaciones fallidas:\n\n${texto}`);
  });
}

module.exports = registerAutomatizacionesFlow;
