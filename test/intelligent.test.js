const test = require("node:test");
const assert = require("node:assert/strict");

process.env.TELEGRAM_BOT_TOKEN ||= "test-token";

const {
  extraerEcuadorRegex,
  combinarExtraccion,
  compararComprobante,
  compararFacturaDocente,
} = require("../src/ia/documentVerifier");
const { localIntent, comandoSugerido } = require("../src/ia/nlpIntent.service");
const { extraerCamposFactura } = require("../src/ia/documentIntelligence.client");

test("regex Ecuador detecta RUC, clave de acceso y número de factura", () => {
  const clave = "1".repeat(49);
  const r = extraerEcuadorRegex(`RUC 1790012345001 FACTURA 001-002-000000123 CLAVE ${clave}`);
  assert.deepEqual(r.rucs, ["1790012345001"]);
  assert.equal(r.clavesAcceso[0], clave);
  assert.equal(r.numerosDocumento[0], "001-002-000000123");
});

test("Document Intelligence se normaliza a campos de factura", () => {
  const raw = {
    analyzeResult: {
      content: "FACTURA 001-002-000000123",
      documents: [{
        docType: "invoice",
        confidence: 0.91,
        fields: {
          InvoiceId: { valueString: "001-002-000000123", confidence: 0.95 },
          InvoiceDate: { valueDate: "2026-09-21", confidence: 0.94 },
          InvoiceTotal: { valueCurrency: { amount: 125.5, currencyCode: "USD" }, confidence: 0.96 },
          VendorName: { valueString: "Proveedor SA", confidence: 0.9 },
        },
      }],
    },
  };
  const r = extraerCamposFactura(raw);
  assert.equal(r.data.numeroDocumento, "001-002-000000123");
  assert.equal(r.data.fechaEmision, "2026-09-21");
  assert.equal(r.data.total, 125.5);
  assert.equal(r.data.moneda, "USD");
  assert.ok(r.confianza > 0.9);
});

test("comprobante con fecha y monto distintos queda sugerido para revisión", () => {
  const r = compararComprobante({
    comprobante: { fechaCompra: "2026-09-20", tipo: "factura", proveedorCedula: null },
    solicitud: { montoAproximado: 100 },
    extraido: { fechaEmision: "2026-09-21", tipoDocumento: "factura", total: 120 },
    confianza: 0.9,
  });
  assert.equal(r.recomendacion, "revisar");
  assert.ok(r.alerts.some((a) => a.code === "FECHA_DIFIERE"));
  assert.ok(r.alerts.some((a) => a.code === "MONTO_DIFIERE_SOLICITUD"));
});

test("factura docente compara monto, número y concepto sin aprobar automáticamente", () => {
  const r = compararFacturaDocente({
    factura: { montoSolicitado: 450, numeroFactura: "001-001-123", conceptoSolicitado: "SERVICIOS DOCENCIA" },
    extraido: { total: 450, numeroDocumento: "001-001-124", conceptoPrincipal: "SERVICIOS DOCENCIA" },
    confianza: 0.95,
  });
  assert.equal(r.recomendacion, "revisar");
  assert.ok(r.alerts.some((a) => a.code === "NUMERO_FACTURA_DIFIERE"));
});

test("NLP local reconoce registrar comprobante en lenguaje natural", () => {
  const r = localIntent("Quiero subir una factura para la solicitud 24");
  assert.equal(r.intent, "registrar_comprobante");
  assert.equal(r.solicitudId, 24);
  assert.match(comandoSugerido(r), /comprobante/);
});

test("NLP local reconoce resumen mensual", () => {
  const r = localIntent("Dame el resumen operativo 2026-09");
  assert.equal(r.intent, "resumen_operativo");
  assert.equal(r.periodo, "2026-09");
  assert.equal(comandoSugerido(r), "/resumenoperativo 2026-09");
});

test("combina extracción DI con regex sin inventar datos", () => {
  const clave = "9".repeat(49);
  const r = combinarExtraccion({ contenido: `RUC 1790012345001 CLAVE ${clave}`, proveedorNombre: "ACME", total: 10 }, null);
  assert.equal(r.rucEmisor, "1790012345001");
  assert.equal(r.claveAcceso, clave);
  assert.equal(r.razonSocialEmisor, "ACME");
  assert.equal(r.total, 10);
});
