const MODES = new Set(["migrate", "validate", "sync", "sync-alter"]);

function normalizarSchemaMode(value, nodeEnv = "development") {
  const mode = String(value || "migrate").trim().toLowerCase();
  if (!MODES.has(mode)) {
    throw new Error(`DB_SCHEMA_MODE inválido: ${mode}. Valores permitidos: ${[...MODES].join(", ")}`);
  }
  if (nodeEnv === "production" && mode === "sync-alter") {
    throw new Error("DB_SCHEMA_MODE=sync-alter está bloqueado en producción. Usa migrate.");
  }
  return mode;
}

module.exports = { MODES, normalizarSchemaMode };
