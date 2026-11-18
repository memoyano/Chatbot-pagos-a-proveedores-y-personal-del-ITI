const config = require("../config/env");

function enabled() {
  const cfg = config.ai.documentIntelligence;
  return Boolean(cfg.enabled && cfg.endpoint && cfg.key);
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || "").replace(/\/+$/, "");
}

function valorCampo(field) {
  if (!field) return null;
  if (field.valueCurrency && typeof field.valueCurrency.amount === "number") return field.valueCurrency.amount;
  if (field.valueNumber != null) return field.valueNumber;
  if (field.valueDate) return field.valueDate;
  if (field.valueString != null) return field.valueString;
  if (field.valuePhoneNumber != null) return field.valuePhoneNumber;
  if (field.valueCountryRegion != null) return field.valueCountryRegion;
  if (field.content != null) return field.content;
  return null;
}

function confianzaCampo(field) {
  const value = Number(field?.confidence);
  return Number.isFinite(value) ? value : null;
}

function extraerCamposFactura(result) {
  const doc = result?.analyzeResult?.documents?.[0] || null;
  const f = doc?.fields || {};
  const first = (...names) => {
    for (const name of names) if (f[name]) return f[name];
    return null;
  };

  const selected = {
    numeroDocumento: first("InvoiceId", "InvoiceNumber"),
    fechaEmision: first("InvoiceDate"),
    proveedorNombre: first("VendorName"),
    proveedorRuc: first("VendorTaxId", "VendorId"),
    clienteNombre: first("CustomerName"),
    clienteRuc: first("CustomerTaxId", "CustomerId"),
    subtotal: first("SubTotal"),
    impuestos: first("TotalTax"),
    total: first("InvoiceTotal", "AmountDue"),
    ordenCompra: first("PurchaseOrder"),
  };

  const data = {};
  const confidences = [];
  for (const [key, field] of Object.entries(selected)) {
    data[key] = valorCampo(field);
    const c = confianzaCampo(field);
    if (c != null) confidences.push(c);
  }

  data.moneda = f.InvoiceTotal?.valueCurrency?.currencyCode || f.AmountDue?.valueCurrency?.currencyCode || null;
  data.contenido = String(result?.analyzeResult?.content || "").slice(0, config.ai.maxOcrChars);
  data.tipoDetectado = doc?.docType || null;
  data.confianzaDocumento = Number.isFinite(Number(doc?.confidence)) ? Number(doc.confidence) : null;

  const confianza = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : data.confianzaDocumento;

  return { data, confianza };
}

async function analizarDocumento({ buffer, contentType = "application/octet-stream", modelId = null }) {
  if (!enabled()) throw new Error("Azure Document Intelligence no está habilitado/configurado.");
  const cfg = config.ai.documentIntelligence;
  const endpoint = normalizeEndpoint(cfg.endpoint);
  const model = modelId || cfg.invoiceModel;
  const url = `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(model)}:analyze?api-version=${encodeURIComponent(cfg.apiVersion)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": cfg.key,
        "Content-Type": contentType,
      },
      body: buffer,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status !== 202) {
    const text = await response.text();
    throw new Error(`Document Intelligence respondió HTTP ${response.status}: ${text.slice(0, 600)}`);
  }

  const operationLocation = response.headers.get("operation-location");
  if (!operationLocation) throw new Error("Document Intelligence no devolvió Operation-Location.");

  const deadline = Date.now() + cfg.pollTimeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, cfg.pollIntervalMs));
    const poll = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": cfg.key },
    });
    const body = await poll.json();
    if (!poll.ok) throw new Error(`Error consultando análisis documental HTTP ${poll.status}.`);
    if (body.status === "succeeded") {
      return { raw: body, ...extraerCamposFactura(body), model };
    }
    if (body.status === "failed") {
      const message = body.error?.message || "Document Intelligence marcó el análisis como fallido.";
      throw new Error(message);
    }
  }
  throw new Error("Document Intelligence excedió el tiempo máximo de análisis.");
}

module.exports = { enabled, analizarDocumento, extraerCamposFactura };
