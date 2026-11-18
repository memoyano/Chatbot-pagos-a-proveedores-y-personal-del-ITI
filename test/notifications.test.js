const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/rules/recordatorios.rules");
const { nombreComando, camposSeguros } = require("../src/domains/auditoria/auditoria.utils");

test("miércoles activa recordatorio de corte y viernes no", () => {
  assert.equal(rules.esMiercoles("2026-09-16"), true);
  assert.equal(rules.esMiercoles("2026-09-17"), false);
  assert.equal(rules.esViernes("2026-09-18"), true);
});

test("cierre contable septiembre recuerda dos días antes", () => {
  const r = rules.evaluarRecordatoriosCierres("2026-09-26");
  assert.equal(r.cierreContable, "2026-09-28");
  assert.equal(r.diasContable, 2);
  assert.equal(r.recordarContable, true);
});

test("cierre de caja chica febrero usa día 25", () => {
  const r = rules.evaluarRecordatoriosCierres("2026-02-23");
  assert.equal(r.cierreCaja, "2026-02-25");
  assert.equal(r.diasCaja, 2);
  assert.equal(r.recordarCaja, true);
});

test("cierre contable febrero usa día 26", () => {
  const r = rules.evaluarRecordatoriosCierres("2026-02-24");
  assert.equal(r.cierreContable, "2026-02-26");
  assert.equal(r.recordarContable, true);
});

test("no recuerda cierre fuera de umbrales 2,1,0", () => {
  const r = rules.evaluarRecordatoriosCierres("2026-09-24");
  assert.equal(r.diasContable, 4);
  assert.equal(r.recordarContable, false);
});

test("eventos se recuerdan a 7, 3, 1 y 0 días", () => {
  for (const fecha of ["2026-09-11", "2026-09-15", "2026-09-17", "2026-09-18"]) {
    assert.equal(rules.debeRecordarEvento({ fechaReferencia: fecha, fechaEvento: "2026-09-18", estado: "pendiente_revision" }), true);
  }
  assert.equal(rules.debeRecordarEvento({ fechaReferencia: "2026-09-14", fechaEvento: "2026-09-18", estado: "pendiente_revision" }), false);
});

test("eventos rechazados no generan recordatorio", () => {
  assert.equal(rules.debeRecordarEvento({ fechaReferencia: "2026-09-11", fechaEvento: "2026-09-18", estado: "rechazado" }), false);
});

test("facturas docentes recuerdan dos días, un día y el día límite", () => {
  assert.equal(rules.debeRecordarFacturaDocente({ fechaReferencia: "2026-09-18", fechaLimite: "2026-09-20", estado: "pendiente" }), true);
  assert.equal(rules.debeRecordarFacturaDocente({ fechaReferencia: "2026-09-19", fechaLimite: "2026-09-20", estado: "con_error" }), true);
  assert.equal(rules.debeRecordarFacturaDocente({ fechaReferencia: "2026-09-20", fechaLimite: "2026-09-20", estado: "pendiente" }), true);
  assert.equal(rules.debeRecordarFacturaDocente({ fechaReferencia: "2026-09-17", fechaLimite: "2026-09-20", estado: "pendiente" }), false);
});

test("auditoría extrae comando sin parámetros ni nombre del bot", () => {
  assert.equal(nombreComando("/verificar 12"), "verificar");
  assert.equal(nombreComando("/estado@ChatbotITI"), "estado");
  assert.equal(nombreComando("hola"), null);
});

test("auditoría excluye campos de archivos y secretos del detalle", () => {
  const r = camposSeguros(["estado", "rutaFactura", "otpHash", "montoFactura", "token"]);
  assert.deepEqual(r, ["estado", "montoFactura"]);
});
