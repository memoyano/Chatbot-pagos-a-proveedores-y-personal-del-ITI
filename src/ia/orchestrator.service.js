const config = require("../config/env");
const logger = require("../utils/logger");
const Comprobante = require("../domains/comprobantes/comprobante.model");
const SolicitudPago = require("../domains/solicitudesPago/solicitudPago.model");
const FacturaDocente = require("../domains/docentes/facturaDocente.model");
const analisisService = require("../domains/ia/analisisIA.service");
const documentIntelligence = require("./documentIntelligence.client");
const { fileIdDesdeRuta, descargarArchivoTelegram } = require("./telegramFile");
const verifier = require("./documentVerifier");

function available() {
  return documentIntelligence.enabled();
}

function formatAlerts(alerts = []) {
  if (!alerts.length) return "Sin alertas automáticas.";
  return alerts.map((a) => `• ${a.message}`).join("\n");
}

async function runDocumentAnalysis({ telegram, fileId, entidadTipo, entidadId, actor, comparator, metadata = {} }) {
  if (!available()) throw new Error("La capa de IA documental no está habilitada.");
  const row = await analisisService.crearPendiente({
    entidadTipo,
    entidadId,
    tipoAnalisis: "documento",
    proveedor: "azure_document_intelligence",
    modelo: config.ai.documentIntelligence.invoiceModel,
    actor,
    metadata,
  });

  try {
    const downloaded = await descargarArchivoTelegram(telegram, fileId, {
      timeoutMs: config.ai.downloadTimeoutMs,
      maxBytes: config.ai.maxFileBytes,
    });
    await row.update({ inputHash: downloaded.sha256, metadata: { ...metadata, bytes: downloaded.bytes, contentType: downloaded.contentType } });

    const di = await documentIntelligence.analizarDocumento({
      buffer: downloaded.buffer,
      contentType: downloaded.contentType,
    });
    let nlp = null;
    try {
      nlp = await verifier.enriquecerConNlp(di.data);
    } catch (error) {
      logger.warn("Enriquecimiento NLP documental no disponible", { entidadTipo, entidadId, error: error.message });
    }
    const extraido = verifier.combinarExtraccion(di.data, nlp);
    const nlpConfidence = Number(nlp?.confianza);
    const confianza = Number.isFinite(nlpConfidence)
      ? (di.confianza != null ? (Number(di.confianza) + nlpConfidence) / 2 : nlpConfidence)
      : di.confianza;
    const evaluation = comparator(extraido, confianza);
    const alertas = [...(nlp?.alertas || []).map((message) => ({ code: "NLP", message, severity: "info" })), ...evaluation.alerts];
    const proveedor = nlp ? "combinado" : "azure_document_intelligence";
    const completed = await analisisService.completar(row.id, {
      confianza,
      recomendacion: evaluation.recomendacion,
      datosExtraidos: extraido,
      alertas,
      proveedor,
      modelo: nlp ? `${di.model}+${config.ai.openai.model}` : di.model,
      metadata: { ...metadata, bytes: downloaded.bytes, contentType: downloaded.contentType },
    });
    return completed;
  } catch (error) {
    await analisisService.fallar(row.id, error);
    throw error;
  }
}

async function analizarComprobante({ telegram, comprobanteId, actor = {} }) {
  const comprobante = await Comprobante.findByPk(comprobanteId);
  if (!comprobante) throw new Error(`No existe el comprobante #${comprobanteId}.`);
  const fileId = fileIdDesdeRuta(comprobante.rutaArchivo || comprobante.rutaLiquidacionCompra);
  if (!fileId) throw new Error(`El comprobante #${comprobanteId} no tiene un archivo de Telegram disponible para IA.`);
  const solicitud = comprobante.solicitudPagoId ? await SolicitudPago.findByPk(comprobante.solicitudPagoId) : null;
  return runDocumentAnalysis({
    telegram,
    fileId,
    entidadTipo: "comprobante",
    entidadId: comprobante.id,
    actor,
    metadata: { solicitudPagoId: comprobante.solicitudPagoId || null, tipo: comprobante.tipo },
    comparator: (extraido, confianza) => verifier.compararComprobante({ comprobante, solicitud, extraido, confianza }),
  });
}

async function analizarFacturaDocente({ telegram, rolPagoId, docenteCedula, actor = {} }) {
  const factura = await FacturaDocente.findOne({ where: { rolPagoId, docenteCedula } });
  if (!factura) throw new Error(`No existe factura para el docente ${docenteCedula} en el rol #${rolPagoId}.`);
  const fileId = fileIdDesdeRuta(factura.rutaFactura);
  if (!fileId) throw new Error("La factura no tiene un archivo de Telegram disponible para IA.");
  return runDocumentAnalysis({
    telegram,
    fileId,
    entidadTipo: "factura_docente",
    entidadId: factura.id,
    actor,
    metadata: { rolPagoId, docenteCedula },
    comparator: (extraido, confianza) => verifier.compararFacturaDocente({ factura, extraido, confianza }),
  });
}

async function programar({ promiseFactory, bot, chatId, etiqueta }) {
  try {
    const result = await promiseFactory();
    const alerts = Array.isArray(result.alertas) ? result.alertas : [];
    const datos = result.datosExtraidos || {};
    const lines = [
      `🤖 Análisis IA #${result.id} completado — ${etiqueta}.`,
      `Recomendación: ${result.recomendacion === "sin_alertas" ? "✅ sin alertas automáticas" : "⚠️ revisar"}.`,
      result.confianza != null ? `Confianza: ${Number(result.confianza).toFixed(2)}.` : null,
      datos.numeroDocumento ? `Documento detectado: ${datos.numeroDocumento}.` : null,
      datos.total != null ? `Total detectado: ${datos.moneda || "USD"} ${Number(datos.total).toFixed(2)}.` : null,
      alerts.length ? `\n${formatAlerts(alerts)}` : null,
      "\nLa IA es apoyo documental; la validación final sigue siendo humana y normativa.",
    ].filter(Boolean);
    await bot.telegram.sendMessage(chatId, lines.join("\n"));
    return result;
  } catch (error) {
    logger.warn("Análisis IA programado falló", { etiqueta, error: error.message });
    try {
      await bot.telegram.sendMessage(chatId, `⚠️ El análisis IA de ${etiqueta} no pudo completarse: ${error.message}`);
    } catch (_) {}
    return null;
  }
}

function programarComprobante({ bot, chatId, comprobanteId, actor }) {
  if (!available()) return;
  setImmediate(() => {
    void programar({
      bot,
      chatId,
      etiqueta: `comprobante #${comprobanteId}`,
      promiseFactory: () => analizarComprobante({ telegram: bot.telegram, comprobanteId, actor }),
    });
  });
}

function programarFacturaDocente({ bot, chatId, rolPagoId, docenteCedula, actor }) {
  if (!available()) return;
  setImmediate(() => {
    void programar({
      bot,
      chatId,
      etiqueta: `factura docente ${docenteCedula} / rol #${rolPagoId}`,
      promiseFactory: () => analizarFacturaDocente({ telegram: bot.telegram, rolPagoId, docenteCedula, actor }),
    });
  });
}

module.exports = {
  available,
  analizarComprobante,
  analizarFacturaDocente,
  programarComprobante,
  programarFacturaDocente,
  formatAlerts,
};
