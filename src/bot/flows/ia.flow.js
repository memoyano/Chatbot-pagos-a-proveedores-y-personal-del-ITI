const config = require("../../config/env");
const { requireRol } = require("../middlewares/auth.middleware");
const analisisService = require("../../domains/ia/analisisIA.service");
const orchestrator = require("../../ia/orchestrator.service");
const documentIntelligence = require("../../ia/documentIntelligence.client");
const openai = require("../../ia/azureOpenAI.client");
const nlp = require("../../ia/nlpIntent.service");

function partes(ctx) {
  return ctx.message.text.trim().split(/\s+/);
}

function actor(ctx) {
  return {
    telegramId: String(ctx.from.id),
    nombre: ctx.state.usuario?.nombre || null,
  };
}

function renderAnalisis(row) {
  const data = row.datosExtraidos || {};
  const alerts = Array.isArray(row.alertas) ? row.alertas : [];
  const lines = [
    `🤖 Análisis IA #${row.id}`,
    `Entidad: ${row.entidadTipo}${row.entidadId ? ` #${row.entidadId}` : ""}`,
    `Estado: ${row.estado}`,
    `Proveedor: ${row.proveedor}`,
    row.modelo ? `Modelo: ${row.modelo}` : null,
    row.confianza != null ? `Confianza: ${Number(row.confianza).toFixed(2)}` : null,
    row.recomendacion ? `Recomendación: ${row.recomendacion}` : null,
    data.numeroDocumento ? `Número: ${data.numeroDocumento}` : null,
    data.rucEmisor ? `RUC emisor: ${data.rucEmisor}` : null,
    data.fechaEmision ? `Fecha: ${data.fechaEmision}` : null,
    data.total != null ? `Total: ${data.moneda || "USD"} ${Number(data.total).toFixed(2)}` : null,
    data.conceptoPrincipal ? `Concepto: ${data.conceptoPrincipal}` : null,
    alerts.length ? `\nAlertas:\n${alerts.map((a) => `• ${a.message || a}`).join("\n")}` : "\nSin alertas automáticas.",
    "\n⚠️ Resultado asistivo: no reemplaza la revisión de Contabilidad ni el motor de políticas.",
  ].filter(Boolean);
  return lines.join("\n");
}

function registerIAFlow(bot) {
  bot.command("iaestado", async (ctx) => {
    return ctx.reply(
      `🤖 Estado IA\n\n` +
      `Document Intelligence: ${documentIntelligence.enabled() ? "✅ habilitado" : "➖ deshabilitado"}\n` +
      `Modelo documental: ${config.ai.documentIntelligence.invoiceModel}\n` +
      `NLP Azure OpenAI: ${config.ai.nlpEnabled && openai.enabled() ? "✅ habilitado" : "➖ fallback local"}\n` +
      `Modelo NLP: ${config.ai.openai.model || "nlp-local-v1"}\n` +
      `Umbral confianza: ${config.ai.minConfidence}`
    );
  });

  bot.command("iaanalizarcomprobante", requireRol("contadora"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso: /iaanalizarcomprobante <id>");
    if (!orchestrator.available()) return ctx.reply("⚠️ Azure Document Intelligence no está habilitado/configurado.");
    ctx.reply(`🤖 Análisis IA iniciado para el comprobante #${id}. Te notificaré al terminar.`);
    orchestrator.programarComprobante({ bot, chatId: ctx.chat.id, comprobanteId: id, actor: actor(ctx) });
  });

  bot.command("iaanalizarfactura", requireRol("contadora", "asistente_contable"), async (ctx) => {
    const p = partes(ctx);
    const rolPagoId = Number(p[1]);
    const docenteCedula = p[2];
    if (!rolPagoId || !docenteCedula) return ctx.reply("Uso: /iaanalizarfactura <rolId> <cedula>");
    if (!orchestrator.available()) return ctx.reply("⚠️ Azure Document Intelligence no está habilitado/configurado.");
    ctx.reply(`🤖 Análisis IA iniciado para la factura de ${docenteCedula} en el rol #${rolPagoId}.`);
    orchestrator.programarFacturaDocente({ bot, chatId: ctx.chat.id, rolPagoId, docenteCedula, actor: actor(ctx) });
  });

  bot.command("iaresultado", requireRol("contadora", "asistente_contable", "director_general", "coordinador_general"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso: /iaresultado <idAnalisis>");
    const row = await analisisService.obtener(id);
    if (!row) return ctx.reply(`No existe el análisis IA #${id}.`);
    return ctx.reply(renderAnalisis(row));
  });

  // NLP/NLU: interpreta lenguaje natural únicamente cuando no hay un flujo activo.
  // Nunca ejecuta automáticamente una acción financiera; propone el comando explícito.
  bot.on("text", async (ctx, next) => {
    if (ctx.session?.flow) return next();
    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith("/")) return next();

    const result = await nlp.interpretar({
      text,
      role: ctx.state.usuario?.rol || "desconocido",
      actor: actor(ctx),
    });
    if (result.intent === "desconocido" || Number(result.confidence) < config.ai.nlpMinConfidence) {
      return ctx.reply("No logré identificar con suficiente confianza qué gestión necesitas. Usa /start para ver los comandos disponibles.");
    }

    return ctx.reply(
      `🧠 Entendí: ${result.intent.replace(/_/g, " ")} (${Number(result.confidence).toFixed(2)}).\n` +
      `Comando sugerido: ${result.comandoSugerido}\n\n` +
      `Por seguridad, las acciones financieras no se ejecutan solo por interpretación de lenguaje natural; confirma usando el comando indicado.`
    );
  });
}

module.exports = registerIAFlow;
