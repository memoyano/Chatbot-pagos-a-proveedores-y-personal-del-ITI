require("dotenv").config();
const { normalizarSchemaMode } = require("./schemaMode");

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || "development";
const telegramMode = (process.env.TELEGRAM_MODE || "polling").toLowerCase();
const webhookBaseUrl =
  process.env.TELEGRAM_WEBHOOK_BASE_URL ||
  (process.env.WEBSITE_HOSTNAME ? `https://${process.env.WEBSITE_HOSTNAME}` : "");

const config = {
  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    mode: telegramMode,
    webhookPath: process.env.TELEGRAM_WEBHOOK_PATH || "/telegram/webhook",
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    webhookBaseUrl,
    updateLeaseSeconds: Number(process.env.TELEGRAM_UPDATE_LEASE_SECONDS || 300),
    updateRetentionDays: Number(process.env.TELEGRAM_UPDATE_RETENTION_DAYS || 30),
  },
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || "chatbot_iti",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    ssl: process.env.DB_SSL === "true",
    connectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS || 15000),
    schemaMode: normalizarSchemaMode(process.env.DB_SCHEMA_MODE, nodeEnv),
  },
  server: {
    port: Number(process.env.PORT || 3000),
    env: nodeEnv,
    jsonLimit: process.env.HTTP_JSON_LIMIT || "1mb",
    shutdownTimeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS || 15000),
  },
  session: {
    ttlHours: Number(process.env.BOT_SESSION_TTL_HOURS || 72),
  },
  ops: {
    apiKey: process.env.OPS_API_KEY || "",
  },
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED === "true",
    sessionSecret: process.env.DASHBOARD_SESSION_SECRET || "",
    sessionHours: Number(process.env.DASHBOARD_SESSION_HOURS || 8),
    allowedRoles: (process.env.DASHBOARD_ALLOWED_ROLES || "contadora,asistente_contable,coordinador_general,director_general,colecturia,cash_management,coordinador_carrera")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  },
  azure: {
    storageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || "",
    appInsightsConnectionString: process.env.APPINSIGHTS_CONNECTION_STRING || "",
  },
  ai: {
    autoAnalyzeDocuments: process.env.AI_AUTO_ANALYZE_DOCUMENTS === "true",
    minConfidence: Number(process.env.AI_MIN_CONFIDENCE || 0.72),
    nlpMinConfidence: Number(process.env.AI_NLP_MIN_CONFIDENCE || 0.60),
    nlpEnabled: process.env.AI_NLP_ENABLED === "true",
    maxOcrChars: Number(process.env.AI_MAX_OCR_CHARS || 12000),
    maxFileBytes: Number(process.env.AI_MAX_FILE_BYTES || 4 * 1024 * 1024),
    downloadTimeoutMs: Number(process.env.AI_DOWNLOAD_TIMEOUT_MS || 20000),
    documentIntelligence: {
      enabled: process.env.AI_DOCUMENT_INTELLIGENCE_ENABLED === "true",
      endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "",
      key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || "",
      apiVersion: process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION || "2024-11-30",
      invoiceModel: process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL || "prebuilt-invoice",
      requestTimeoutMs: Number(process.env.AI_DOCUMENT_REQUEST_TIMEOUT_MS || 30000),
      pollTimeoutMs: Number(process.env.AI_DOCUMENT_POLL_TIMEOUT_MS || 90000),
      pollIntervalMs: Number(process.env.AI_DOCUMENT_POLL_INTERVAL_MS || 1200),
    },
    openai: {
      enabled: process.env.AI_AZURE_OPENAI_ENABLED === "true",
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
      apiKey: process.env.AZURE_OPENAI_API_KEY || "",
      model: process.env.AZURE_OPENAI_MODEL || "",
      requestTimeoutMs: Number(process.env.AI_OPENAI_REQUEST_TIMEOUT_MS || 45000),
    },
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "no-reply@iti.edu.ec",
  },
};

function validarConfiguracion(cfg = config) {
  const errors = [];
  const warnings = [];

  if (!["polling", "webhook"].includes(cfg.telegram.mode)) {
    errors.push("TELEGRAM_MODE debe ser polling o webhook.");
  }
  if (!Number.isInteger(cfg.db.port) || cfg.db.port < 1 || cfg.db.port > 65535) {
    errors.push("DB_PORT no es válido.");
  }
  if (!Number.isFinite(cfg.server.port) || cfg.server.port <= 0) {
    errors.push("PORT no es válido.");
  }
  if (!Number.isFinite(cfg.telegram.updateLeaseSeconds) || cfg.telegram.updateLeaseSeconds < 30) {
    errors.push("TELEGRAM_UPDATE_LEASE_SECONDS debe ser >= 30.");
  }
  if (!Number.isFinite(cfg.session.ttlHours) || cfg.session.ttlHours < 1) {
    errors.push("BOT_SESSION_TTL_HOURS debe ser >= 1.");
  }

  if (cfg.telegram.mode === "webhook") {
    if (!cfg.telegram.webhookBaseUrl) errors.push("Webhook activo pero no existe URL base pública.");
    if (!cfg.telegram.webhookPath.startsWith("/")) errors.push("TELEGRAM_WEBHOOK_PATH debe iniciar con '/'.");
    if (cfg.server.env === "production" && !cfg.telegram.webhookSecret) {
      errors.push("TELEGRAM_WEBHOOK_SECRET es obligatorio en producción con webhook.");
    }
  }

  if (cfg.server.env === "production" && !cfg.ops.apiKey) {
    warnings.push("OPS_API_KEY no configurada: /ops/summary quedará deshabilitado.");
  }

  if (cfg.dashboard.enabled) {
    if (!cfg.dashboard.sessionSecret || cfg.dashboard.sessionSecret.length < 32) {
      errors.push("DASHBOARD_ENABLED=true requiere DASHBOARD_SESSION_SECRET de al menos 32 caracteres.");
    }
    if (!Number.isFinite(cfg.dashboard.sessionHours) || cfg.dashboard.sessionHours < 1 || cfg.dashboard.sessionHours > 24) {
      errors.push("DASHBOARD_SESSION_HOURS debe estar entre 1 y 24.");
    }
    if (!cfg.dashboard.allowedRoles.length) {
      errors.push("DASHBOARD_ALLOWED_ROLES debe incluir al menos un rol.");
    }
  }

  if (cfg.ai.documentIntelligence.enabled && (!cfg.ai.documentIntelligence.endpoint || !cfg.ai.documentIntelligence.key)) {
    errors.push("AI_DOCUMENT_INTELLIGENCE_ENABLED=true requiere AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT y AZURE_DOCUMENT_INTELLIGENCE_KEY.");
  }
  if (cfg.ai.openai.enabled && (!cfg.ai.openai.endpoint || !cfg.ai.openai.apiKey || !cfg.ai.openai.model)) {
    errors.push("AI_AZURE_OPENAI_ENABLED=true requiere AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY y AZURE_OPENAI_MODEL.");
  }
  if (!Number.isFinite(cfg.ai.minConfidence) || cfg.ai.minConfidence < 0 || cfg.ai.minConfidence > 1) {
    errors.push("AI_MIN_CONFIDENCE debe estar entre 0 y 1.");
  }
  if (!Number.isFinite(cfg.ai.nlpMinConfidence) || cfg.ai.nlpMinConfidence < 0 || cfg.ai.nlpMinConfidence > 1) {
    errors.push("AI_NLP_MIN_CONFIDENCE debe estar entre 0 y 1.");
  }
  if (!cfg.smtp.host || !cfg.smtp.user || !cfg.smtp.pass) {
    warnings.push("SMTP incompleto: el envío automático de OTP/facturas docentes puede fallar.");
  }
  if (!cfg.db.ssl && cfg.db.host.includes("mysql.database.azure.com")) {
    warnings.push("Azure MySQL detectado con DB_SSL=false; revisa la configuración TLS.");
  }

  return { valido: errors.length === 0, errors, warnings };
}

module.exports = Object.assign(config, { validarConfiguracion });
