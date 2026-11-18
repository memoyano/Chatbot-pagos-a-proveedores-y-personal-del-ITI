const { DocumentAnalysisClient, AzureKeyCredential } = require("@azure/ai-form-recognizer");
const config = require("../config/env");
const logger = require("./logger");

let client = null;

function getClient() {
  if (!config.docIntelligence.endpoint || !config.docIntelligence.key) return null;
  if (!client) {
    client = new DocumentAnalysisClient(
      config.docIntelligence.endpoint,
      new AzureKeyCredential(config.docIntelligence.key)
    );
  }
  return client;
}

async function analizarFactura(fileUrl) {
  const c = getClient();
  if (!c) {
    logger.debug("Document Intelligence no configurado; se omite el análisis con IA.");
    return null;
  }

  try {
    const poller = await c.beginAnalyzeDocumentFromUrl("prebuilt-invoice", fileUrl);
    const { documents } = await poller.pollUntilDone();
    const documento = documents && documents[0];
    if (!documento) return null;

    const fechaRaw = documento.fields.InvoiceDate?.value;
    const fechaFactura = fechaRaw ? new Date(fechaRaw).toISOString().slice(0, 10) : null;
    const proveedor = documento.fields.VendorName?.value || null;
    const total = documento.fields.InvoiceTotal?.value?.amount ?? null;

    logger.info("Documento analizado con Document Intelligence", { fechaFactura, proveedor, total });
    return { fechaFactura, proveedor, total, confianza: documento.confidence ?? null };
  } catch (err) {
    logger.warn("No se pudo analizar el documento con Document Intelligence", { error: err.message });
    return null;
  }
}

module.exports = { analizarFactura };
