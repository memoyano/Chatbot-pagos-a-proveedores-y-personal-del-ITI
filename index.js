const config = require("./src/config/env");
const logger = require("./src/utils/logger");
const { sequelize, connectDatabase } = require("./src/config/database");
const { setRuntimeState } = require("./src/config/runtimeState");
const createApp = require("./src/app");
const { notFound, errorHandler } = require("./src/http/middleware");
const { createOpsAuth } = require("./src/http/opsAuth");
const { buildInfo } = require("./src/config/buildInfo");
const { generarResumenOperativo } = require("./src/domains/reportes/reporteOperativo.service");
const { normalizarPeriodo } = require("./src/rules/reportes.rules");
const { registerDashboard } = require("./src/dashboard/router");

require("./src/models");

const { prepararSchema } = require("./src/migrations/schemaManager");
const { migrationStatus } = require("./src/migrations/runner");
const { registrarHooksAuditoria } = require("./src/domains/auditoria/auditoria.hooks");
const bot = require("./src/bot");
const { iniciarJobs } = require("./src/jobs");
const jobStatus = require("./src/jobs/status");

registrarHooksAuditoria();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerShutdownHandlers(server, jobs = []) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    setRuntimeState({ shuttingDown: true, telegramReady: false, jobsStarted: false });
    logger.info(`Apagado solicitado (${signal})`);

    const timeout = sleep(config.server.shutdownTimeoutMs).then(() => {
      throw new Error("Timeout de apagado alcanzado");
    });

    const graceful = (async () => {
      for (const job of jobs) {
        try { job.stop(); } catch (_) {}
      }

      if (config.telegram.mode === "polling") {
        try { bot.stop(signal); } catch (_) {}
      }

      if (server) {
        await new Promise((resolve) => server.close(resolve));
        logger.info("Servidor HTTP detenido");
      }

      try {
        await sequelize.close();
        setRuntimeState({ databaseConnected: false });
        logger.info("Conexión a MySQL cerrada");
      } catch (error) {
        logger.warn("No fue posible cerrar MySQL limpiamente", { error: error.message });
      }
    })();

    try {
      await Promise.race([graceful, timeout]);
      process.exit(0);
    } catch (error) {
      logger.error("Apagado forzado", { error: error.message });
      process.exit(1);
    }
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

async function bootstrap() {
  const configCheck = config.validarConfiguracion();
  for (const warning of configCheck.warnings) logger.warn(warning);
  if (!configCheck.valido) {
    throw new Error(`Configuración inválida:\n- ${configCheck.errors.join("\n- ")}`);
  }

  await connectDatabase();
  await prepararSchema(sequelize, config.db.schemaMode);
  setRuntimeState({ schemaReady: true });
  logger.info("Esquema de base de datos listo", { mode: config.db.schemaMode });

  const app = createApp();

  app.get("/health/telegram", async (_req, res) => {
    try {
      const info = await bot.telegram.getWebhookInfo();
      return res.json({
        status: "ok",
        mode: config.telegram.mode,
        webhookConfigured: Boolean(info.url),
        webhookUrl: info.url || null,
        pendingUpdateCount: info.pending_update_count || 0,
        lastErrorDate: info.last_error_date || null,
        lastErrorMessage: info.last_error_message || null,
      });
    } catch (error) {
      logger.error("Health check de Telegram falló", { error: error.message });
      return res.status(503).json({ status: "error", telegram: "unavailable" });
    }
  });

  app.get("/health/automations", (_req, res) => {
    return res.json({
      status: "ok",
      timezone: require("./src/utils/fechas").DEFAULT_TIMEZONE,
      jobs: jobStatus.obtenerEstados(),
    });
  });

  app.get("/health/ai", (_req, res) => {
    const di = require("./src/ia/documentIntelligence.client");
    const openai = require("./src/ia/azureOpenAI.client");
    return res.json({
      status: "ok",
      documentIntelligence: {
        enabled: config.ai.documentIntelligence.enabled,
        configured: di.enabled(),
        model: config.ai.documentIntelligence.invoiceModel,
        apiVersion: config.ai.documentIntelligence.apiVersion,
      },
      nlp: {
        enabled: config.ai.nlpEnabled,
        azureOpenAIConfigured: openai.enabled(),
        mode: config.ai.nlpEnabled && openai.enabled() ? "azure_openai" : "reglas_locales",
        model: config.ai.openai.model || "nlp-local-v1",
      },
      autoAnalyzeDocuments: config.ai.autoAnalyzeDocuments,
      minConfidence: config.ai.minConfidence,
    });
  });

  app.get("/health/schema", async (_req, res) => {
    try {
      const rows = await migrationStatus(sequelize);
      const pending = rows.filter((r) => !r.applied || !r.checksumOk);
      return res.status(pending.length ? 503 : 200).json({
        status: pending.length ? "error" : "ok",
        mode: config.db.schemaMode,
        migrations: rows.map(({ name, applied, checksumOk, appliedAt }) => ({ name, applied, checksumOk, appliedAt })),
      });
    } catch (error) {
      logger.error("Health check de esquema falló", { error: error.message });
      return res.status(503).json({ status: "error", schema: "unavailable" });
    }
  });


  app.get("/version", (_req, res) => {
    return res.json({ status: "ok", ...buildInfo() });
  });

  const opsAuth = createOpsAuth(config.ops.apiKey);
  app.get("/ops/summary", opsAuth, async (req, res) => {
    try {
      const periodo = normalizarPeriodo(req.query.period || undefined);
      const reporte = await generarResumenOperativo(periodo);
      return res.json({ status: "ok", ...reporte });
    } catch (error) {
      if (/Período inválido/.test(error.message)) {
        return res.status(400).json({ status: "error", code: "INVALID_PERIOD", message: error.message, requestId: req.requestId });
      }
      logger.error("No se pudo generar resumen operativo HTTP", { requestId: req.requestId, error: error.message });
      return res.status(503).json({ status: "error", code: "OPS_SUMMARY_UNAVAILABLE", requestId: req.requestId });
    }
  });

  registerDashboard(app);

  if (config.telegram.mode === "webhook") {
    const callbackOptions = config.telegram.webhookSecret
      ? { secretToken: config.telegram.webhookSecret }
      : {};
    app.use(bot.webhookCallback(config.telegram.webhookPath, callbackOptions));
  }

  app.use(notFound);
  app.use(errorHandler);

  const server = app.listen(config.server.port, () => {
    logger.info(`Servidor Express escuchando en el puerto ${config.server.port}`);
  });

  const jobs = iniciarJobs(bot);
  setRuntimeState({ jobsStarted: true });
  registerShutdownHandlers(server, jobs);

  if (config.telegram.mode === "webhook") {
    const webhookUrl = `${config.telegram.webhookBaseUrl}${config.telegram.webhookPath}`;
    const extra = { drop_pending_updates: false };
    if (config.telegram.webhookSecret) extra.secret_token = config.telegram.webhookSecret;

    await bot.telegram.setWebhook(webhookUrl, extra);
    const info = await bot.telegram.getWebhookInfo();
    if (info.url !== webhookUrl) {
      throw new Error(`Telegram no confirmó el webhook esperado. URL actual: ${info.url || "vacía"}`);
    }

    setRuntimeState({ telegramReady: true });
    logger.info("Bot de Telegram iniciado (modo webhook)", { webhookUrl });
    return;
  }

  logger.info("Iniciando bot de Telegram (modo polling)");
  setRuntimeState({ telegramReady: true });
  await bot.launch();
}

bootstrap().catch((err) => {
  logger.error("Error al iniciar la aplicación", { error: err.message, stack: err.stack });
  process.exit(1);
});
