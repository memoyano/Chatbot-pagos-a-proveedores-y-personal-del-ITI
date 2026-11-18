const { parseDateOnly, partesDateOnly } = require("../utils/fechas");
const pagosRules = require("./politicaPagos.rules");

function diasHasta(fechaReferencia, fechaObjetivo) {
  return Math.round((parseDateOnly(fechaObjetivo) - parseDateOnly(fechaReferencia)) / 86400000);
}

function diaSemana(fecha) {
  return parseDateOnly(fecha).getUTCDay();
}

function esMiercoles(fecha) {
  return diaSemana(fecha) === 3;
}

function esViernes(fecha) {
  return diaSemana(fecha) === 5;
}

function evaluarRecordatoriosCierres(fechaReferencia) {
  const { anio, mesIndiceCero } = partesDateOnly(fechaReferencia);
  const cierreContable = pagosRules.fechaLimiteDelMes(anio, mesIndiceCero, "cierre_contable");
  const cierreCaja = pagosRules.fechaLimiteDelMes(anio, mesIndiceCero, "caja_chica");
  const diasContable = diasHasta(fechaReferencia, cierreContable);
  const diasCaja = diasHasta(fechaReferencia, cierreCaja);
  const umbrales = new Set([2, 1, 0]);
  return {
    cierreContable,
    cierreCaja,
    diasContable,
    diasCaja,
    recordarContable: umbrales.has(diasContable),
    recordarCaja: umbrales.has(diasCaja),
  };
}

function debeRecordarEvento({ fechaReferencia, fechaEvento, estado }) {
  if (["rechazado"].includes(estado)) return false;
  const dias = diasHasta(fechaReferencia, fechaEvento);
  return [7, 3, 1, 0].includes(dias);
}

function debeRecordarFacturaDocente({ fechaReferencia, fechaLimite, estado }) {
  if (!["pendiente", "con_error"].includes(estado) || !fechaLimite) return false;
  const dias = diasHasta(fechaReferencia, fechaLimite);
  return [2, 1, 0].includes(dias);
}

module.exports = {
  diasHasta,
  esMiercoles,
  esViernes,
  evaluarRecordatoriosCierres,
  debeRecordarEvento,
  debeRecordarFacturaDocente,
};
