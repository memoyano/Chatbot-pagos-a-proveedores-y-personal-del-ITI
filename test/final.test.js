const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizarPeriodo,
  limitesPeriodoDateOnly,
  limitesPeriodoUtcEcuador,
  totalPendientesCriticos,
  formatearResumenTelegram,
} = require("../src/rules/reportes.rules");
const { extraerOpsKey, equalsSeguro } = require("../src/http/opsAuth");
const { jobConErrorVigente, evaluarSaludOperativa } = require("../src/rules/operacion.rules");


test("normalizarPeriodo acepta AAAA-MM válido", () => {
  assert.equal(normalizarPeriodo("2026-09"), "2026-09");
});

test("normalizarPeriodo rechaza meses inválidos", () => {
  assert.throws(() => normalizarPeriodo("2026-13"), /Período inválido/);
  assert.throws(() => normalizarPeriodo("09-2026"), /Período inválido/);
});

test("límites date-only cubren exactamente el mes", () => {
  assert.deepEqual(limitesPeriodoDateOnly("2026-09"), {
    inicio: "2026-09-01",
    finExclusivo: "2026-10-01",
  });
});

test("límites date-only manejan cambio de año", () => {
  assert.deepEqual(limitesPeriodoDateOnly("2026-12"), {
    inicio: "2026-12-01",
    finExclusivo: "2027-01-01",
  });
});

test("límites UTC representan medianoche de Ecuador", () => {
  const r = limitesPeriodoUtcEcuador("2026-09");
  assert.equal(r.inicio.toISOString(), "2026-09-01T05:00:00.000Z");
  assert.equal(r.finExclusivo.toISOString(), "2026-10-01T05:00:00.000Z");
});

test("totalPendientesCriticos suma solo rubros pendientes/errores", () => {
  const total = totalPendientesCriticos({
    pagos: { pendientes: 2, enProceso: 3 },
    documentos: { pendientes: 1, correccionRequerida: 1 },
    cajaChica: { pendientesRevision: 2 },
    eventos: { pendientesRevision: 1 },
    docentes: { facturasPendientes: 2, facturasConError: 1, facturasRezagadas: 1 },
    operacion: { notificacionesFallidas: 1, telegramUpdatesFallidos: 1 },
  });
  assert.equal(total, 16);
});

test("formatearResumenTelegram incluye período y estado operativo", () => {
  const texto = formatearResumenTelegram({
    periodo: "2026-09",
    pagos: { total: 2, pagadas: 1, pendientes: 1, enProceso: 0, montoRegistrado: 100, montoPagadoAproximado: 50 },
    documentos: {}, cajaChica: {}, eventos: {}, docentes: {}, operacion: {},
  });
  assert.match(texto, /Resumen operativo — 2026-09/);
  assert.match(texto, /USD 100\.00/);
});

test("extraerOpsKey acepta header dedicado y Bearer", () => {
  assert.equal(extraerOpsKey({ headers: { "x-ops-key": "abc" } }), "abc");
  assert.equal(extraerOpsKey({ headers: { authorization: "Bearer xyz" } }), "xyz");
});

test("equalsSeguro compara claves sin aceptar tamaños distintos", () => {
  assert.equal(equalsSeguro("secreto", "secreto"), true);
  assert.equal(equalsSeguro("secreto", "otro"), false);
  assert.equal(equalsSeguro("", ""), false);
});

test("jobConErrorVigente ignora un error ya recuperado", () => {
  assert.equal(jobConErrorVigente({ lastErrorAt: "2026-09-20T10:00:00Z", lastError: "x", lastSuccessAt: "2026-09-20T11:00:00Z" }), false);
  assert.equal(jobConErrorVigente({ lastErrorAt: "2026-09-20T12:00:00Z", lastError: "x", lastSuccessAt: "2026-09-20T11:00:00Z" }), true);
});

test("evaluarSaludOperativa activa alerta por fallos persistentes", () => {
  const r = evaluarSaludOperativa({
    notificacionesFallidas: 1,
    telegramUpdatesFallidos: 0,
    jobs: [],
  });
  assert.equal(r.alertar, true);
  assert.equal(r.notificacionesFallidas, 1);
});
