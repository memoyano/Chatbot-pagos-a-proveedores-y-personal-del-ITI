const crypto = require("crypto");
const logger = require("../utils/logger");

function requestContext(req, res, next) {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

function notFound(req, res) {
  return res.status(404).json({
    status: "error",
    code: "NOT_FOUND",
    requestId: req.requestId,
  });
}

function errorHandler(err, req, res, _next) {
  logger.error("Error HTTP no controlado", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    error: err.message,
  });
  if (res.headersSent) return;
  return res.status(500).json({
    status: "error",
    code: "INTERNAL_ERROR",
    requestId: req.requestId,
  });
}

module.exports = { requestContext, securityHeaders, notFound, errorHandler };
