process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "test-token";

const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/rules/politicaDocentes.rules");
const { construirCorreoSolicitudFacturaDocente } = require("../src/utils/mailTemplates");

test("plazo de factura docente suma 3 días calendario", () => {
  assert.equal(rules.calcularFechaLimiteFactura("2026-09-18"), "2026-09-21");
});

test("factura recibida exactamente en el día límite está a tiempo", () => {
  assert.equal(
    rules.facturaDocenteATiempo({ fechaSolicitud: "2026-09-18", fechaRecepcion: "2026-09-21" }),
    true
  );
});

test("factura del día siguiente al límite queda fuera de plazo", () => {
  assert.equal(
    rules.facturaDocenteATiempo({ fechaSolicitud: "2026-09-18", fechaRecepcion: "2026-09-22" }),
    false
  );
});

test("concepto debe coincidir exactamente salvo espacios externos", () => {
  assert.equal(rules.conceptoExacto("SERVICIOS DOCENTES SEPTIEMBRE", "SERVICIOS DOCENTES SEPTIEMBRE"), true);
  assert.equal(rules.conceptoExacto(" SERVICIOS DOCENTES ", "SERVICIOS DOCENTES"), true);
  assert.equal(rules.conceptoExacto("Servicios docentes", "SERVICIOS DOCENTES"), false);
});

test("monto se compara a centavos", () => {
  assert.equal(rules.montoExacto("450.00", 450), true);
  assert.equal(rules.montoExacto("450.00", "450.01"), false);
});

test("factura correcta y a tiempo entra al rol actual", () => {
  const r = rules.evaluarFacturaDocente({
    fechaSolicitud: "2026-09-18",
    fechaRecepcion: "2026-09-20",
    conceptoSolicitado: "DOCENCIA SEPTIEMBRE",
    conceptoFactura: "DOCENCIA SEPTIEMBRE",
    montoSolicitado: "500.00",
    montoFactura: 500,
  });
  assert.equal(r.elegibleRolActual, true);
  assert.equal(r.elegibleFinSemestre, false);
  assert.deepEqual(r.motivos, []);
});

test("factura correcta pero tardía queda lista para fin de semestre", () => {
  const r = rules.evaluarFacturaDocente({
    fechaSolicitud: "2026-09-18",
    fechaRecepcion: "2026-09-22",
    conceptoSolicitado: "DOCENCIA SEPTIEMBRE",
    conceptoFactura: "DOCENCIA SEPTIEMBRE",
    montoSolicitado: "500.00",
    montoFactura: "500.00",
  });
  assert.equal(r.elegibleRolActual, false);
  assert.equal(r.elegibleFinSemestre, true);
  assert.match(r.motivos.join(" "), /fuera del plazo/);
});

test("factura con concepto distinto no queda lista ni para rol ni fin de semestre", () => {
  const r = rules.evaluarFacturaDocente({
    fechaSolicitud: "2026-09-18",
    fechaRecepcion: "2026-09-22",
    conceptoSolicitado: "DOCENCIA SEPTIEMBRE",
    conceptoFactura: "DOCENCIA AGOSTO",
    montoSolicitado: "500.00",
    montoFactura: "500.00",
  });
  assert.equal(r.documentacionCorrecta, false);
  assert.equal(r.elegibleRolActual, false);
  assert.equal(r.elegibleFinSemestre, false);
});

test("vencimiento solo ocurre después de terminar la fecha límite", () => {
  assert.equal(rules.facturaVencida({ fechaLimite: "2026-09-21", fechaReferencia: "2026-09-21" }), false);
  assert.equal(rules.facturaVencida({ fechaLimite: "2026-09-21", fechaReferencia: "2026-09-22" }), true);
});

test("correo incluye concepto exacto, valor, fecha límite y aviso de coordinador", () => {
  const { asunto, cuerpo } = construirCorreoSolicitudFacturaDocente({
    nombre: "Docente Uno",
    periodo: "2026-S2",
    conceptoSolicitado: "DOCENCIA SEPTIEMBRE 2026",
    montoSolicitado: 450,
    fechaLimite: "2026-09-21",
  });
  assert.match(asunto, /2026-S2/);
  assert.match(cuerpo, /DOCENCIA SEPTIEMBRE 2026/);
  assert.match(cuerpo, /USD 450\.00/);
  assert.match(cuerpo, /2026-09-21/);
  assert.match(cuerpo, /coordinador/i);
});
