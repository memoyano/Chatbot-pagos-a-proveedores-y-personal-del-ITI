const test = require("node:test");
const assert = require("node:assert/strict");

const { validarRequisitosDocumentalesComprobante: resultadoDocumental } = require("../src/rules/politicaPagos.rules");

test("factura simple queda documentalmente completa con archivo principal", () => {
  const r = resultadoDocumental({ tipo: "factura", rutaArchivo: "telegram:1" });
  assert.equal(r.completa, true);
  assert.deepEqual(r.faltantes, []);
});

test("compra con tarjeta requiere respaldo adicional", () => {
  const r = resultadoDocumental({
    tipo: "factura",
    rutaArchivo: "telegram:1",
    esCompraTarjetaInstitucional: true,
  });
  assert.equal(r.completa, false);
  assert.match(r.faltantes.join(" "), /tarjeta institucional/);
});

test("compra por internet requiere tipo y archivo de respaldo", () => {
  const r = resultadoDocumental({
    tipo: "factura",
    rutaArchivo: "telegram:1",
    esCompraInternet: true,
  });
  assert.equal(r.completa, false);
  assert.match(r.faltantes.join(" "), /compra por internet/);
});

test("nota de venta exige checklist tributario", () => {
  const r = resultadoDocumental({
    tipo: "nota_venta",
    rutaArchivo: "telegram:1",
    notaVentaRimpeNegocioPopular: true,
    notaVentaEmitidaNombreITI: true,
    notaVentaRucAplica: false,
    notaVentaLegible: true,
    notaVentaSinEnmendaduras: true,
    notaVentaDatosCompletos: true,
  });
  assert.equal(r.completa, true);
});

test("nota de venta falla si el RUC debía constar y no consta", () => {
  const r = resultadoDocumental({
    tipo: "nota_venta",
    rutaArchivo: "telegram:1",
    notaVentaRimpeNegocioPopular: true,
    notaVentaEmitidaNombreITI: true,
    notaVentaRucAplica: true,
    notaVentaRucInstitucional: false,
    notaVentaLegible: true,
    notaVentaSinEnmendaduras: true,
    notaVentaDatosCompletos: true,
  });
  assert.equal(r.completa, false);
  assert.match(r.faltantes.join(" "), /RUC institucional/);
});

test("liquidación requiere cédula, archivo de cédula y liquidación emitida el mismo día", () => {
  const r = resultadoDocumental({
    tipo: "liquidacion_compra",
    fechaCompra: "2026-09-18",
    proveedorCedula: "0102030405",
    rutaCedulaProveedor: "telegram:cedula",
    fechaLiquidacionCompra: "2026-09-18",
    rutaLiquidacionCompra: "telegram:liquidacion",
  });
  assert.equal(r.completa, true);
});

test("liquidación queda incompleta si fue elaborada otro día", () => {
  const r = resultadoDocumental({
    tipo: "liquidacion_compra",
    fechaCompra: "2026-09-18",
    proveedorCedula: "0102030405",
    rutaCedulaProveedor: "telegram:cedula",
    fechaLiquidacionCompra: "2026-09-19",
    rutaLiquidacionCompra: "telegram:liquidacion",
  });
  assert.equal(r.completa, false);
  assert.match(r.faltantes.join(" "), /mismo día/);
});
