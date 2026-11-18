const express = require("express");
const { sequelize } = require("./config/database");
const config = require("./config/env");
const logger = require("./utils/logger");
const { getRuntimeState } = require("./config/runtimeState");
const { requestContext, securityHeaders } = require("./http/middleware");

function createApp({ db = sequelize } = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(securityHeaders);
  app.use(express.json({ limit: config.server.jsonLimit }));

  // Liveness: solo confirma que el proceso HTTP está vivo.
  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok", service: "chatbot-iti", timestamp: new Date().toISOString() });
  });

  async function readiness(_req, res) {
    const runtime = getRuntimeState();
    try {
      await db.query("SELECT 1 AS ok");
      const ready = runtime.schemaReady && runtime.databaseConnected;
      return res.status(ready ? 200 : 503).json({
        status: ready ? "ok" : "starting",
        service: "chatbot-iti",
        database: "connected",
        schemaReady: runtime.schemaReady,
        telegramReady: runtime.telegramReady,
        jobsStarted: runtime.jobsStarted,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Readiness de base de datos falló", { error: error.message });
      return res.status(503).json({
        status: "error",
        service: "chatbot-iti",
        database: "unavailable",
        schemaReady: runtime.schemaReady,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Compatibilidad con Azure warmup existente.
  app.get("/health", readiness);
  app.get("/health/ready", readiness);

  app.get("/health/db", async (_req, res) => {
    try {
      await db.query("SELECT 1 AS ok");
      return res.json({
        status: "ok",
        service: "chatbot-iti",
        database: "connected",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Health check de base de datos falló", { error: error.message });
      return res.status(503).json({
        status: "error",
        service: "chatbot-iti",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  });

  return app;
}

module.exports = createApp;
