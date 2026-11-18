const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/rules/politicaPagos.rules");

test("evento con exactamente 7 días cumple la anticipación mínima", () => {
  const r = rules.validarAnticipacionEvento({
    fechaPlanificacion: "2026-09-10",
    fechaEvento: "2026-09-17",
  });
  assert.equal(r.valido, true);
  assert.equal(r.dias, 7);
  assert.equal(r.motivo, null);
});

test("evento con 6 días no cumple la anticipación mínima", () => {
  const r = rules.validarAnticipacionEvento({
    fechaPlanificacion: "2026-09-11",
    fechaEvento: "2026-09-17",
  });
  assert.equal(r.valido, false);
  assert.equal(r.dias, 6);
  assert.match(r.motivo, /una \(1\) semana/);
});

test("evento no puede tener fecha anterior a la planificación", () => {
  const r = rules.validarAnticipacionEvento({
    fechaPlanificacion: "2026-09-17",
    fechaEvento: "2026-09-16",
  });
  assert.equal(r.valido, false);
  assert.equal(r.dias, -1);
});

test("Caja Chica presentada el 28 entra al mismo período en un mes normal", () => {
  const r = rules.evaluarReembolsoCajaChica({ fechaPresentacion: "2026-09-28" });
  assert.equal(r.dentroPlazo, true);
  assert.equal(r.fechaLimite, "2026-09-28");
  assert.equal(r.periodoPresentacion, "2026-09");
  assert.equal(r.periodoProcesamiento, "2026-09");
  assert.equal(r.diferido, false);
});

test("Caja Chica presentada el 29 pasa al siguiente período", () => {
  const r = rules.evaluarReembolsoCajaChica({ fechaPresentacion: "2026-09-29" });
  assert.equal(r.dentroPlazo, false);
  assert.equal(r.fechaLimite, "2026-09-28");
  assert.equal(r.periodoProcesamiento, "2026-10");
  assert.equal(r.diferido, true);
});

test("Caja Chica de febrero usa día 25 como límite", () => {
  const aTiempo = rules.evaluarReembolsoCajaChica({ fechaPresentacion: "2026-02-25" });
  const tarde = rules.evaluarReembolsoCajaChica({ fechaPresentacion: "2026-02-26" });
  assert.equal(aTiempo.dentroPlazo, true);
  assert.equal(aTiempo.fechaLimite, "2026-02-25");
  assert.equal(tarde.dentroPlazo, false);
  assert.equal(tarde.periodoProcesamiento, "2026-03");
});

test("Caja Chica fuera de plazo en diciembre difiere a enero del siguiente año", () => {
  const r = rules.evaluarReembolsoCajaChica({ fechaPresentacion: "2026-12-29" });
  assert.equal(r.periodoProcesamiento, "2027-01");
});

test("cálculo de período contable siguiente maneja cambio de año", () => {
  assert.equal(rules.periodoContableSiguiente("2026-11"), "2026-12");
  assert.equal(rules.periodoContableSiguiente("2026-12"), "2027-01");
});
