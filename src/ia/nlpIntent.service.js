const crypto = require("crypto");
const config = require("../config/env");
const openai = require("./azureOpenAI.client");
const analisisService = require("../domains/ia/analisisIA.service");

const INTENTS = [
  "registrar_solicitud", "registrar_comprobante", "registrar_proveedor", "consultar_estado",
  "registrar_evento", "registrar_caja_chica", "ver_documentos", "validar_comprobante",
  "resumen_operativo", "pendientes_criticos", "ayuda", "desconocido"
];

const SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    solicitudId: { type: ["integer", "null"] },
    comprobanteId: { type: ["integer", "null"] },
    periodo: { type: ["string", "null"] },
    motivo: { type: ["string", "null"] },
  },
  required: ["intent", "confidence", "solicitudId", "comprobanteId", "periodo", "motivo"],
  additionalProperties: false,
};

function extractNumber(text) {
  const m = String(text).match(/\b(\d{1,9})\b/);
  return m ? Number(m[1]) : null;
}

function extractPeriod(text) {
  return String(text).match(/\b(20\d{2}-(?:0[1-9]|1[0-2]))\b/)?.[1] || null;
}

function localIntent(text) {
  const t = String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const n = extractNumber(t);
  const periodo = extractPeriod(t);
  if (/\b(ayuda|comandos|que puedo|menu)\b/.test(t)) return { intent: "ayuda", confidence: 0.9 };
  if (/\b(resumen|reporte operativo|operacion del mes)\b/.test(t)) return { intent: "resumen_operativo", confidence: 0.82, periodo };
  if (/\b(pendientes|criticos|alertas)\b/.test(t)) return { intent: "pendientes_criticos", confidence: 0.78, periodo };
  if (/\b(validar|aprobar)\b.*\b(comprobante|factura)\b/.test(t)) return { intent: "validar_comprobante", confidence: 0.78, comprobanteId: n };
  if (/\b(documentos|documentacion)\b/.test(t)) return { intent: "ver_documentos", confidence: 0.75, solicitudId: n };
  if (/\b(comprobante|factura|nota de venta|liquidacion)\b/.test(t) && /\b(registrar|subir|cargar|enviar|adjuntar|tengo)\b/.test(t)) return { intent: "registrar_comprobante", confidence: 0.8, solicitudId: n };
  if (/\b(solicitud|pago)\b/.test(t) && /\b(registrar|crear|nueva|hacer|quiero)\b/.test(t)) return { intent: "registrar_solicitud", confidence: 0.76 };
  if (/\b(proveedor)\b/.test(t) && /\b(registrar|nuevo|crear)\b/.test(t)) return { intent: "registrar_proveedor", confidence: 0.8 };
  if (/\b(estado|como va|seguimiento)\b/.test(t)) return { intent: "consultar_estado", confidence: 0.8 };
  if (/\b(evento|graduacion|navidad|aniversario)\b/.test(t)) return { intent: "registrar_evento", confidence: 0.72 };
  if (/\b(caja chica|reembolso)\b/.test(t)) return { intent: "registrar_caja_chica", confidence: 0.76 };
  return { intent: "desconocido", confidence: 0.2, solicitudId: null, comprobanteId: null, periodo: null, motivo: null };
}

async function aiIntent(text, role) {
  const system =
    "Clasifica la intención de un funcionario dentro del chatbot administrativo ITI. " +
    `Rol actual: ${role}. Solo puedes usar estos intents: ${INTENTS.join(", ")}. ` +
    "Extrae IDs solo si están explícitos. No inventes parámetros. No autorices ni ejecutes pagos.";
  const result = await openai.structuredResponse({
    system,
    user: String(text).slice(0, 1500),
    schema: SCHEMA,
    name: "IntencionChatbotITI",
    maxOutputTokens: 400,
  });
  return result.data;
}

function comandoSugerido(result) {
  const r = result || {};
  switch (r.intent) {
    case "registrar_solicitud": return "/solicitud";
    case "registrar_comprobante": return r.solicitudId ? `/comprobante  (solicitud detectada: #${r.solicitudId})` : "/comprobante";
    case "registrar_proveedor": return "/proveedor";
    case "consultar_estado": return "/estado";
    case "registrar_evento": return "/evento";
    case "registrar_caja_chica": return "/cajachica";
    case "ver_documentos": return r.solicitudId ? `/documentos ${r.solicitudId}` : "/documentos <id>";
    case "validar_comprobante": return r.comprobanteId ? `/validarcomprobante ${r.comprobanteId}` : "/validarcomprobante <id>";
    case "resumen_operativo": return r.periodo ? `/resumenoperativo ${r.periodo}` : "/resumenoperativo";
    case "pendientes_criticos": return r.periodo ? `/pendientescriticos ${r.periodo}` : "/pendientescriticos";
    case "ayuda": return "/start";
    default: return null;
  }
}

async function interpretar({ text, role, actor = {} }) {
  const hash = crypto.createHash("sha256").update(String(text)).digest("hex");
  let result;
  let proveedor = "reglas_locales";
  let modelo = "nlp-local-v1";
  try {
    if (config.ai.nlpEnabled && openai.enabled()) {
      result = await aiIntent(text, role);
      proveedor = "azure_openai";
      modelo = config.ai.openai.model;
    } else {
      result = localIntent(text);
    }
  } catch (_) {
    result = localIntent(text);
    proveedor = "reglas_locales";
    modelo = "nlp-local-v1";
  }

  const row = await analisisService.crearPendiente({
    entidadTipo: "mensaje",
    tipoAnalisis: "nlp_intent",
    proveedor,
    modelo,
    actor,
    inputHash: hash,
  });
  await analisisService.completar(row.id, {
    confianza: Number(result.confidence || 0),
    recomendacion: result.intent === "desconocido" ? "no_concluyente" : "sin_alertas",
    datosExtraidos: { ...result, comandoSugerido: comandoSugerido(result) },
  });
  return { ...result, comandoSugerido: comandoSugerido(result), proveedor };
}

module.exports = { interpretar, localIntent, comandoSugerido, INTENTS };
