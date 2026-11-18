const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { normalizarSchemaMode } = require("../src/config/schemaMode");
const { leaseExpirado, calcularExpiracionSesion, debeRetenerUpdate } = require("../src/rules/runtime.rules");
const { createSequelizeSessionStore } = require("../src/domains/runtime/sessionStore");
const { listMigrationFiles, checksumFor, migrationNameFromFile } = require("../src/migrations/utils");
const { sanitize } = require("../src/utils/redact");

test("schema mode usa migrate por defecto", () => {
  assert.equal(normalizarSchemaMode(undefined, "production"), "migrate");
  assert.equal(normalizarSchemaMode(undefined, "development"), "migrate");
});

test("schema mode bloquea sync-alter en producción", () => {
  assert.equal(normalizarSchemaMode("validate", "production"), "validate");
  assert.throws(() => normalizarSchemaMode("sync-alter", "production"), /bloqueado en producción/);
});

test("schema mode rechaza valores desconocidos", () => {
  assert.throws(() => normalizarSchemaMode("magic", "development"), /inválido/);
});

test("lease de update solo expira después del umbral", () => {
  const now = new Date("2026-09-20T15:05:00Z");
  assert.equal(leaseExpirado(new Date("2026-09-20T15:01:00Z"), 300, now), false);
  assert.equal(leaseExpirado(new Date("2026-09-20T15:00:00Z"), 300, now), true);
  assert.equal(leaseExpirado(null, 300, now), true);
});

test("expiración de sesión respeta TTL configurado", () => {
  const start = new Date("2026-09-20T10:00:00Z");
  assert.equal(calcularExpiracionSesion(start, 72).toISOString(), "2026-09-23T10:00:00.000Z");
});

test("retención de updates distingue registros viejos", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  assert.equal(debeRetenerUpdate("2026-09-15T00:00:00Z", 30, now), true);
  assert.equal(debeRetenerUpdate("2026-08-01T00:00:00Z", 30, now), false);
});

test("session store persiste, recupera y elimina una sesión", async () => {
  const rows = new Map();
  const model = {
    async findByPk(key) {
      const value = rows.get(key);
      if (!value) return null;
      return { ...value, async destroy() { rows.delete(key); } };
    },
    async upsert(value) { rows.set(value.sessionKey, { ...value }); },
    async destroy({ where }) { return rows.delete(where.sessionKey) ? 1 : 0; },
  };
  const now = () => new Date("2026-09-20T10:00:00Z");
  const store = createSequelizeSessionStore({ model, ttlHours: 2, now });
  await store.set("1:1", { flow: "comprobante", step: "fecha" });
  assert.deepEqual(await store.get("1:1"), { flow: "comprobante", step: "fecha" });
  await store.delete("1:1");
  assert.equal(await store.get("1:1"), undefined);
});

test("session store descarta sesiones expiradas", async () => {
  let destroyed = false;
  const model = {
    async findByPk() {
      return { data: { flow: "x" }, expiresAt: new Date("2026-09-20T09:00:00Z"), async destroy() { destroyed = true; } };
    },
  };
  const store = createSequelizeSessionStore({ model, now: () => new Date("2026-09-20T10:00:00Z") });
  assert.equal(await store.get("1:1"), undefined);
  assert.equal(destroyed, true);
});

test("migraciones productivas están ordenadas y presentes", () => {
  const dir = path.join(__dirname, "..", "src", "migrations");

  assert.deepEqual(listMigrationFiles(dir), [
    "202609200001-baseline-fase5.js",
    "202609200002-runtime-hardening.js",
    "202609210001-docentes-fase4.js",
    "202609210002-ai-fase8.js",
    "202610090001-roles-autoridad-excepcional.js",
  ]);
});

test("checksum de migración es estable y nombre se deriva correctamente", () => {
  const file = path.join(__dirname, "..", "src", "migrations", "202609200002-runtime-hardening.js");
  const a = checksumFor(file);
  const b = checksumFor(file);
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(migrationNameFromFile(file), "202609200002-runtime-hardening");
});

test("redacción oculta secretos y conserva metadatos normales", () => {
  const result = sanitize({
    token: "abc",
    dbPassword: "123",
    webhookSecret: "xyz",
    nested: { otpHash: "hash", normal: "ok" },
  });
  assert.equal(result.token, "[REDACTED]");
  assert.equal(result.dbPassword, "[REDACTED]");
  assert.equal(result.webhookSecret, "[REDACTED]");
  assert.equal(result.nested.otpHash, "[REDACTED]");
  assert.equal(result.nested.normal, "ok");
});
