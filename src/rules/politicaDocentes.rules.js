const {
  addDaysDateOnly,
  compareDateOnly,
  formatDateOnly,
} = require("../utils/fechas");

const DIAS_PLAZO_FACTURA_DOCENTE = 3;

/** Fecha límite para que el docente facture: solicitud + 3 días calendario. */
function calcularFechaLimiteFactura(fechaSolicitud) {
  return addDaysDateOnly(formatDateOnly(fechaSolicitud), DIAS_PLAZO_FACTURA_DOCENTE);
}

/** Determina si la factura del docente llegó dentro del plazo de 3 días. */
function facturaDocenteATiempo({ fechaSolicitud, fechaRecepcion }) {
  const limite = calcularFechaLimiteFactura(fechaSolicitud);
  return compareDateOnly(fechaRecepcion, fechaSolicitud) >= 0 && compareDateOnly(fechaRecepcion, limite) <= 0;
}

function conceptoExacto(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return a.trim() === b.trim();
}

function montoEnCentavos(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round((n + Number.EPSILON) * 100);
}

function montoExacto(a, b) {
  const ca = montoEnCentavos(a);
  const cb = montoEnCentavos(b);
  return ca !== null && cb !== null && ca === cb;
}

function evaluarFacturaDocente({
  fechaSolicitud,
  fechaRecepcion,
  conceptoSolicitado,
  conceptoFactura,
  montoSolicitado,
  montoFactura,
}) {
  const aTiempo = facturaDocenteATiempo({ fechaSolicitud, fechaRecepcion });
  const conceptoCoincide = conceptoExacto(conceptoSolicitado, conceptoFactura);
  const montoCoincide = montoExacto(montoSolicitado, montoFactura);
  const documentacionCorrecta = conceptoCoincide && montoCoincide;

  const motivos = [];
  if (!conceptoCoincide) motivos.push("El concepto de la factura no coincide exactamente con el solicitado.");
  if (!montoCoincide) motivos.push("El monto de la factura no coincide con el solicitado.");
  if (!aTiempo) motivos.push("La factura fue recibida fuera del plazo de tres (3) días.");

  return {
    aTiempo,
    conceptoCoincide,
    montoCoincide,
    documentacionCorrecta,
    elegibleRolActual: aTiempo && documentacionCorrecta,
    elegibleFinSemestre: !aTiempo && documentacionCorrecta,
    motivos,
  };
}

function facturaVencida({ fechaLimite, fechaReferencia }) {
  return compareDateOnly(fechaReferencia, fechaLimite) > 0;
}

module.exports = {
  DIAS_PLAZO_FACTURA_DOCENTE,
  calcularFechaLimiteFactura,
  facturaDocenteATiempo,
  conceptoExacto,
  montoExacto,
  evaluarFacturaDocente,
  facturaVencida,
};
