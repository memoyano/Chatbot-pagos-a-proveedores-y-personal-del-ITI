const crypto = require("crypto");

function fileIdDesdeRuta(ruta) {
  if (!ruta || typeof ruta !== "string" || !ruta.startsWith("telegram:")) return null;
  return ruta.slice("telegram:".length);
}

async function descargarArchivoTelegram(telegram, fileId, { timeoutMs = 20000, maxBytes = 8 * 1024 * 1024 } = {}) {
  const link = await telegram.getFileLink(fileId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(link.href || String(link), { signal: controller.signal });
    if (!response.ok) throw new Error(`Telegram file download respondió HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength && contentLength > maxBytes) {
      throw new Error(`El archivo supera el límite de análisis IA (${Math.ceil(maxBytes / 1024 / 1024)} MB).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > maxBytes) {
      throw new Error(`El archivo supera el límite de análisis IA (${Math.ceil(maxBytes / 1024 / 1024)} MB).`);
    }
    return {
      buffer,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      bytes: buffer.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fileIdDesdeRuta, descargarArchivoTelegram };
