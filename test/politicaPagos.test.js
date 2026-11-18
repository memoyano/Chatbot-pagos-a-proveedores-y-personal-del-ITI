const test = require("node:test");
const assert = require("node:assert/strict");

const rules = require("../src/rules/politicaPagos.rules");
const { fechaHoyISO, isValidDateOnly } = require("../src/utils/fechas");

test("fechaHoyISO respeta America/Guayaquil y evita salto UTC de día", () => {
  const instante = new Date("2026-09-18T01:03:00Z"); // todavía 17-sep en Ecuador
  assert.equal(fechaHoyISO("America/Guayaquil", instante), "2026-09-17");
});

test("valida fechas calendario reales", () => {
  assert.equal(isValidDateOnly("2026-02-28"), true);
  assert.equal(isValidDateOnly("2026-02-31"), false);
});

test("solicitud normal requiere mínimo 3 días", () => {
  assert.equal(
    rules.validarAnticipacionSolicitud({
      tipo: "normal",
      fechaSolicitud: "2026-09-14",
      fechaDesembolsoRequerida: "2026-09-17",
    }).valido,
    true
  );

  assert.equal(
    rules.validarAnticipacionSolicitud({
      tipo: "normal",
      fechaSolicitud: "2026-09-15",
      fechaDesembolsoRequerida: "2026-09-17",
    }).valido,
    false
  );
});

test("urgente exige justificación y no permite mismo día como urgente ordinaria", () => {
  const sinJustificacion = rules.validarAnticipacionSolicitud({
    tipo: "urgente",
    fechaSolicitud: "2026-09-16",
    fechaDesembolsoRequerida: "2026-09-17",
    justificacion: "",
  });
  assert.equal(sinJustificacion.valido, false);

  const unDia = rules.validarAnticipacionSolicitud({
    tipo: "urgente",
    fechaSolicitud: "2026-09-16",
    fechaDesembolsoRequerida: "2026-09-17",
    justificacion: "Proveedor crítico",
  });
  assert.equal(unDia.valido, true);
  assert.equal(unDia.requiereAutorizacion, false);

  const mismoDia = rules.validarAnticipacionSolicitud({
    tipo: "urgente",
    fechaSolicitud: "2026-09-17",
    fechaDesembolsoRequerida: "2026-09-17",
    justificacion: "Proveedor crítico",
  });
  assert.equal(mismoDia.valido, false);
});

test("excepcional del mismo día queda sujeto a autorización", () => {
  const resultado = rules.validarAnticipacionSolicitud({
    tipo: "excepcional_mismo_dia",
    fechaSolicitud: "2026-09-17",
    fechaDesembolsoRequerida: "2026-09-17",
    justificacion: "Circunstancia extraordinaria",
  });
  assert.equal(resultado.valido, true);
  assert.equal(resultado.requiereAutorizacion, true);
});

test("factura general V21082026 admite el día siguiente dentro del cierre", () => {
  const r = rules.evaluarComprobante({
    tipo: "factura",
    fechaCompra: "2026-09-10",
    fechaEnvio: "2026-09-11",
  });
  assert.equal(r.reconocido, true);
  assert.equal(r.cumplePlazoEnvio, true);
  assert.equal(r.cumpleCierreContable, true);
});

test("tarjeta institucional exige respaldo el mismo día", () => {
  const r = rules.evaluarComprobante({
    tipo: "factura",
    fechaCompra: "2026-09-10",
    fechaEnvio: "2026-09-11",
    esCompraTarjetaInstitucional: true,
  });
  assert.equal(r.reconocido, false);
  assert.equal(r.cumplePlazoEnvio, false);
});

test("nota de venta y liquidación de compra exigen gestión el mismo día", () => {
  for (const tipo of ["nota_venta", "liquidacion_compra"]) {
    const r = rules.evaluarComprobante({
      tipo,
      fechaCompra: "2026-09-10",
      fechaEnvio: "2026-09-11",
    });
    assert.equal(r.reconocido, false);
  }
});

test("cierre contable es 28 normalmente y 26 en febrero", () => {
  assert.equal(rules.fechaLimiteDelMes(2026, 8), "2026-09-28");
  assert.equal(rules.fechaLimiteDelMes(2026, 1), "2026-02-26");

  const febrero26 = rules.evaluarComprobante({
    tipo: "factura",
    fechaCompra: "2026-02-26",
    fechaEnvio: "2026-02-26",
  });
  assert.equal(febrero26.reconocido, true);

  const febrero27 = rules.evaluarComprobante({
    tipo: "factura",
    fechaCompra: "2026-02-27",
    fechaEnvio: "2026-02-27",
  });
  assert.equal(febrero27.cumpleCierreContable, false);
  assert.equal(febrero27.reconocido, false);
});

test("factura del 28 enviada el 29 falla por cierre aunque cumpla plazo general de un día", () => {
  const r = rules.evaluarComprobante({
    tipo: "factura",
    fechaCompra: "2026-09-28",
    fechaEnvio: "2026-09-29",
  });
  assert.equal(r.cumplePlazoEnvio, true);
  assert.equal(r.cumpleCierreContable, false);
  assert.equal(r.reconocido, false);
});

test("solicitud completa miércoles entra al viernes de esa semana", () => {
  const r = rules.calcularProgramacionPago({
    fechaCompleta: "2026-09-16", // miércoles
    fechaDesembolsoRequerida: "2026-09-18", // viernes
    tipo: "normal",
  });
  assert.equal(r.alcanzoCorteSemanal, true);
  assert.equal(r.fechaProgramadaPago, "2026-09-18");
});

test("solicitud completa jueves pasa al viernes siguiente", () => {
  const r = rules.calcularProgramacionPago({
    fechaCompleta: "2026-09-17", // jueves
    fechaDesembolsoRequerida: "2026-09-18",
    tipo: "normal",
  });
  assert.equal(r.alcanzoCorteSemanal, false);
  assert.equal(r.fechaProgramadaPago, "2026-09-25");
});

test("fecha requerida posterior mueve el ciclo al primer viernes compatible", () => {
  const r = rules.calcularProgramacionPago({
    fechaCompleta: "2026-09-16",
    fechaDesembolsoRequerida: "2026-09-22", // martes siguiente
    tipo: "normal",
  });
  assert.equal(r.fechaProgramadaPago, "2026-09-25");
});

test("excepción autorizada conserva el pago del mismo día y omite corte ordinario", () => {
  const r = rules.calcularProgramacionPago({
    fechaCompleta: "2026-09-17",
    fechaDesembolsoRequerida: "2026-09-17",
    tipo: "excepcional_mismo_dia",
    autorizacionExcepcional: true,
  });
  assert.equal(r.alcanzoCorteSemanal, null);
  assert.equal(r.fechaProgramadaPago, "2026-09-17");

  assert.equal(
    rules.validarEjecucionPago({
      fechaPago: "2026-09-17",
      fechaProgramadaPago: "2026-09-17",
      tipo: "excepcional_mismo_dia",
      autorizacionExcepcional: true,
    }).valido,
    true
  );
});

test("pago ordinario solo puede cerrarse viernes y desde la fecha programada", () => {
  assert.equal(
    rules.validarEjecucionPago({
      fechaPago: "2026-09-17",
      fechaProgramadaPago: "2026-09-18",
      tipo: "normal",
    }).valido,
    false
  );
  assert.equal(
    rules.validarEjecucionPago({
      fechaPago: "2026-09-18",
      fechaProgramadaPago: "2026-09-18",
      tipo: "normal",
    }).valido,
    true
  );
});
