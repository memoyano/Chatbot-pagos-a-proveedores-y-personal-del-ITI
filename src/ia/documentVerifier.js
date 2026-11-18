const config = require("../config/env");
const openai = require("./azureOpenAI.client");

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeId(value) {
  return String(value || "").replace(/\D/g, "");
}

function round2(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function extraerEcuadorRegex(content = "") {
  const text = String(content || "");
  const rucs = [...new Set((text.match(/\b\d{13}\b/g) || []))];
  const clavesAcceso = [...new Set((text.match(/\b\d{49}\b/g) || []))];
  const numerosDocumento = [...new Set((text.match(/\b\d{3}[-\s]?\d{3}[-\s]?\d{9}\b/g) || []))]
    .map((v) => v.replace(/\s/g, "-"));
  return { rucs, clavesAcceso, numerosDocumento };
}

const DOC_SCHEMA = {
  type: "object",
  properties: {
    tipoDocumento: { type: ["string", "null"], enum: ["factura", "nota_venta", "liquidacion_compra", "otro", null] },
    rucEmisor: { type: ["string", "null"] },
    razonSocialEmisor: { type: ["string", "null"] },
    numeroDocumento: { type: ["string", "null"] },
    fechaEmision: { type: ["string", "null"] },
    subtotal: { type: ["number", "null"] },
    iva: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    claveAcceso: { type: ["string", "null"] },
    clienteNombre: { type: ["string", "null"] },
    clienteRuc: { type: ["string", "null"] },
    conceptoPrincipal: { type: ["string", "null"] },
    confianza: { type: "number", minimum: 0, maximum: 1 },
    alertas: { type: "array", items: { type: "string" } },
  },
  required: [
    "tipoDocumento", "rucEmisor", "razonSocialEmisor", "numeroDocumento", "fechaEmision",
    "subtotal", "iva", "total", "claveAcceso", "clienteNombre", "clienteRuc",
    "conceptoPrincipal", "confianza", "alertas"
  ],
  additionalProperties: false,
};

async function enriquecerConNlp(diData) {
  if (!openai.enabled()) return null;
  const contenido = String(diData?.contenido || "").slice(0, config.ai.maxOcrChars);
  if (!contenido.trim()) return null;
  const system =
    "Eres una capa de extracción documental para comprobantes tributarios de Ecuador. " +
    "Devuelve únicamente datos que estén explícitamente presentes en el texto OCR. No inventes ni completes datos ausentes. " +
    "El campo conceptoPrincipal debe copiar el concepto o descripción principal tal como aparece, no parafrasearlo. " +
    "Las alertas son observaciones documentales, nunca una aprobación o rechazo contable.";
  const user = `Extrae los campos del siguiente OCR:\n\n${contenido}`;
  const result = await openai.structuredResponse({ system, user, schema: DOC_SCHEMA, name: "DocumentoFiscalEcuador" });
  return result.data;
}

function combinarExtraccion(diData, nlpData) {
  const regex = extraerEcuadorRegex(diData?.contenido);
  return {
    tipoDocumento: nlpData?.tipoDocumento || null,
    rucEmisor: nlpData?.rucEmisor || diData?.proveedorRuc || regex.rucs[0] || null,
    razonSocialEmisor: nlpData?.razonSocialEmisor || diData?.proveedorNombre || null,
    numeroDocumento: nlpData?.numeroDocumento || diData?.numeroDocumento || regex.numerosDocumento[0] || null,
    fechaEmision: nlpData?.fechaEmision || diData?.fechaEmision || null,
    subtotal: round2(nlpData?.subtotal ?? diData?.subtotal),
    iva: round2(nlpData?.iva ?? diData?.impuestos),
    total: round2(nlpData?.total ?? diData?.total),
    claveAcceso: nlpData?.claveAcceso || regex.clavesAcceso[0] || null,
    clienteNombre: nlpData?.clienteNombre || diData?.clienteNombre || null,
    clienteRuc: nlpData?.clienteRuc || diData?.clienteRuc || null,
    conceptoPrincipal: nlpData?.conceptoPrincipal || null,
    ordenCompra: diData?.ordenCompra || null,
    moneda: diData?.moneda || null,
    regex,
  };
}

function addAlert(alerts, code, message, severity = "warning") {
  alerts.push({ code, message, severity });
}

function compararComprobante({ comprobante, solicitud, extraido, confianza }) {
  const alerts = [];
  if (confianza != null && confianza < config.ai.minConfidence) {
    addAlert(alerts, "BAJA_CONFIANZA", `Confianza documental ${Number(confianza).toFixed(2)} menor al umbral ${config.ai.minConfidence}.`);
  }
  if (extraido.fechaEmision && comprobante.fechaCompra && extraido.fechaEmision !== comprobante.fechaCompra) {
    addAlert(alerts, "FECHA_DIFIERE", `La fecha extraída (${extraido.fechaEmision}) difiere de la fecha de compra declarada (${comprobante.fechaCompra}).`);
  }
  if (extraido.tipoDocumento && comprobante.tipo && extraido.tipoDocumento !== "otro" && extraido.tipoDocumento !== comprobante.tipo) {
    addAlert(alerts, "TIPO_DIFIERE", `La IA detectó ${extraido.tipoDocumento}, pero el registro fue declarado como ${comprobante.tipo}.`);
  }
  if (comprobante.proveedorCedula && extraido.rucEmisor) {
    const esperado = normalizeId(comprobante.proveedorCedula);
    const detectado = normalizeId(extraido.rucEmisor);
    if (esperado && detectado && esperado !== detectado) {
      addAlert(alerts, "IDENTIFICACION_DIFIERE", `La identificación detectada del emisor (${extraido.rucEmisor}) difiere de la registrada (${comprobante.proveedorCedula}).`);
    }
  }
  const esperadoMonto = round2(solicitud?.montoAproximado);
  if (esperadoMonto != null && extraido.total != null && Math.abs(esperadoMonto - extraido.total) > 0.01) {
    addAlert(alerts, "MONTO_DIFIERE_SOLICITUD", `El total extraído (USD ${extraido.total.toFixed(2)}) difiere del monto aproximado de la solicitud (USD ${esperadoMonto.toFixed(2)}).`, "info");
  }
  return {
    alerts,
    recomendacion: alerts.some((a) => a.severity === "warning" || a.severity === "critical") ? "revisar" : "sin_alertas",
  };
}

function compararFacturaDocente({ factura, extraido, confianza }) {
  const alerts = [];
  if (confianza != null && confianza < config.ai.minConfidence) {
    addAlert(alerts, "BAJA_CONFIANZA", `Confianza documental ${Number(confianza).toFixed(2)} menor al umbral ${config.ai.minConfidence}.`);
  }
  const esperadoMonto = round2(factura.montoSolicitado);
  if (esperadoMonto != null && extraido.total != null && Math.abs(esperadoMonto - extraido.total) > 0.01) {
    addAlert(alerts, "MONTO_DIFIERE", `Monto esperado USD ${esperadoMonto.toFixed(2)}; total extraído USD ${extraido.total.toFixed(2)}.`);
  }
  if (factura.numeroFactura && extraido.numeroDocumento) {
    const a = normalizeText(factura.numeroFactura).replace(/\s/g, "");
    const b = normalizeText(extraido.numeroDocumento).replace(/\s/g, "");
    if (a !== b) addAlert(alerts, "NUMERO_FACTURA_DIFIERE", `Número registrado ${factura.numeroFactura}; detectado ${extraido.numeroDocumento}.`);
  }
  if (factura.conceptoSolicitado && extraido.conceptoPrincipal) {
    const a = normalizeText(factura.conceptoSolicitado);
    const b = normalizeText(extraido.conceptoPrincipal);
    if (a !== b) addAlert(alerts, "CONCEPTO_DIFIERE", "El concepto extraído no coincide exactamente con el concepto solicitado; requiere revisión humana.");
  }
  return {
    alerts,
    recomendacion: alerts.some((a) => a.severity === "warning" || a.severity === "critical") ? "revisar" : "sin_alertas",
  };
}

module.exports = {
  extraerEcuadorRegex,
  enriquecerConNlp,
  combinarExtraccion,
  compararComprobante,
  compararFacturaDocente,
  normalizeText,
  round2,
};
