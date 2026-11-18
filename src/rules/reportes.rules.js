const { fechaHoyISO } = require("../utils/fechas");

const PERIOD_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;

function normalizarPeriodo(valor, hoy = fechaHoyISO()) {
  const periodo = valor == null || String(valor).trim() === "" ? hoy.slice(0, 7) : String(valor).trim();
  if (!PERIOD_REGEX.test(periodo)) {
    throw new Error(`Período inválido: ${periodo}. Usa AAAA-MM.`);
  }
  return periodo;
}

function limitesPeriodoDateOnly(periodo) {
  const p = normalizarPeriodo(periodo, `${periodo}-01`);
  const [anio, mes] = p.split("-").map(Number);
  const siguiente = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, "0")}`;
  return { inicio: `${p}-01`, finExclusivo: `${siguiente}-01` };
}

function limitesPeriodoUtcEcuador(periodo) {
  const p = normalizarPeriodo(periodo, `${periodo}-01`);
  const [anio, mes] = p.split("-").map(Number);
  const siguienteAnio = mes === 12 ? anio + 1 : anio;
  const siguienteMes = mes === 12 ? 1 : mes + 1;
  return {
    inicio: new Date(Date.UTC(anio, mes - 1, 1, 5, 0, 0)),
    finExclusivo: new Date(Date.UTC(siguienteAnio, siguienteMes - 1, 1, 5, 0, 0)),
  };
}

function numero(valor) {
  const n = Number(valor || 0);
  return Number.isFinite(n) ? n : 0;
}

function dinero(valor) {
  return numero(valor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function totalPendientesCriticos(reporte = {}) {
  const p = reporte.pagos || {};
  const d = reporte.documentos || {};
  const c = reporte.cajaChica || {};
  const e = reporte.eventos || {};
  const doc = reporte.docentes || {};
  const op = reporte.operacion || {};
  return (
    numero(p.pendientes) +
    numero(p.enProceso) +
    numero(d.pendientes) +
    numero(d.correccionRequerida) +
    numero(c.pendientesRevision) +
    numero(e.pendientesRevision) +
    numero(doc.facturasPendientes) +
    numero(doc.facturasConError) +
    numero(doc.facturasRezagadas) +
    numero(op.notificacionesFallidas) +
    numero(op.telegramUpdatesFallidos)
  );
}

function formatearResumenTelegram(reporte) {
  const { periodo, pagos = {}, documentos = {}, cajaChica = {}, eventos = {}, docentes = {}, operacion = {} } = reporte;
  const criticos = totalPendientesCriticos(reporte);
  return [
    `📊 Resumen operativo — ${periodo}`,
    "",
    `💳 Pagos: ${numero(pagos.total)} total | ${numero(pagos.pagadas)} pagadas | ${numero(pagos.pendientes)} pendientes | ${numero(pagos.enProceso)} en proceso`,
    `   Monto registrado: USD ${dinero(pagos.montoRegistrado)} | pagado aprox.: USD ${dinero(pagos.montoPagadoAproximado)}`,
    `📄 Documentos: ${numero(documentos.total)} | ${numero(documentos.validados)} validados | ${numero(documentos.pendientes)} pendientes | ${numero(documentos.correccionRequerida)} con corrección`,
    `🧾 Caja Chica: ${numero(cajaChica.total)} | ${numero(cajaChica.reembolsados)} reembolsados | ${numero(cajaChica.pendientesRevision)} pendientes | ${numero(cajaChica.diferidos)} diferidos`,
    `🎓 Docentes: ${numero(docentes.roles)} roles | ${numero(docentes.rolesPagados)} pagados | ${numero(docentes.facturasPendientes)} facturas pendientes | ${numero(docentes.facturasRezagadas)} rezagadas`,
    `🎉 Eventos: ${numero(eventos.total)} | ${numero(eventos.aprobados)} aprobados | ${numero(eventos.pendientesRevision)} pendientes`,
    `⚙️ Operación: ${numero(operacion.notificacionesFallidas)} notificaciones fallidas | ${numero(operacion.telegramUpdatesFallidos)} updates fallidos`,
    "",
    criticos ? `⚠️ Pendientes/alertas acumuladas en el resumen: ${criticos}` : "✅ Sin pendientes críticos contabilizados en el resumen.",
  ].join("\n");
}

module.exports = {
  PERIOD_REGEX,
  normalizarPeriodo,
  limitesPeriodoDateOnly,
  limitesPeriodoUtcEcuador,
  numero,
  dinero,
  totalPendientesCriticos,
  formatearResumenTelegram,
};
