const { requireRol } = require("../middlewares/auth.middleware");
const auditoriaService = require("../../domains/auditoria/auditoria.service");

const ENTIDADES = {
  solicitud: "SolicitudPago",
  comprobante: "Comprobante",
  proveedor: "Proveedor",
  evento: "EventoInstitucional",
  cajachica: "ReembolsoCajaChica",
  docente: "Docente",
  rol: "RolPagoDocentes",
  factura_docente: "FacturaDocente",
  novedaddocente: "NovedadDocente",
};

function formatear(e) {
  const fecha = new Date(e.createdAt).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
  const transicion = e.estadoAnterior || e.estadoNuevo
    ? ` | ${e.estadoAnterior || "—"} → ${e.estadoNuevo || "—"}`
    : "";
  return `${fecha} | ${e.accion}${transicion}\n${e.actorNombre} (${e.actorRol}/${e.origen})`;
}

async function responderEnPartes(ctx, texto, max = 3500) {
  let restante = texto;
  while (restante.length > max) {
    let corte = restante.lastIndexOf("\n\n", max);
    if (corte < max * 0.5) corte = max;
    await ctx.reply(restante.slice(0, corte));
    restante = restante.slice(corte).trimStart();
  }
  if (restante) await ctx.reply(restante);
}

function registerAuditoriaFlow(bot) {
  bot.command("auditoria", requireRol("contadora", "director_general"), async (ctx) => {
    const [, tipo, id] = ctx.message.text.trim().split(/\s+/);
    const entidad = ENTIDADES[(tipo || "").toLowerCase()];
    if (!entidad || !id) {
      return ctx.reply(
        "Uso: /auditoria <tipo> <id>\n" +
        "Tipos: solicitud, comprobante, proveedor, evento, cajachica, docente, rol, factura_docente, novedaddocente"
      );
    }
    const eventos = await auditoriaService.listarPorEntidad(entidad, id, 30);
    if (!eventos.length) return ctx.reply(`No hay auditoría registrada para ${tipo} #${id}.`);
    return responderEnPartes(ctx, `🧾 Auditoría ${tipo} #${id}:\n\n${eventos.map(formatear).join("\n\n")}`);
  });

  bot.command("auditoriareciente", requireRol("contadora", "director_general"), async (ctx) => {
    const [, nRaw] = ctx.message.text.trim().split(/\s+/);
    const limite = Math.min(Math.max(Number(nRaw) || 20, 1), 50);
    const eventos = await auditoriaService.listarRecientes({ limite });
    if (!eventos.length) return ctx.reply("No hay eventos de auditoría todavía.");
    return responderEnPartes(
      ctx,
      `🧾 Últimos ${eventos.length} eventos:\n\n` +
        eventos.map((e) => `${e.entidad}${e.entidadId ? ` #${e.entidadId}` : ""}\n${formatear(e)}`).join("\n\n")
    );
  });
}

module.exports = registerAuditoriaFlow;
