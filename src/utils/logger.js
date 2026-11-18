const { createLogger, format, transports } = require("winston");
const config = require("../config/env");

const { sanitize } = require("./redact");

const logger = createLogger({
  level: config.server.env === "production" ? "info" : "debug",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const safeMeta = sanitize(meta);
      const metaStr = Object.keys(safeMeta).length ? ` ${JSON.stringify(safeMeta)}` : "";
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [new transports.Console()],
});

logger.sanitize = sanitize;
module.exports = logger;
