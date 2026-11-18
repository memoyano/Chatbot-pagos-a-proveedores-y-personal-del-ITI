const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "America/Guayaquil";

function fechaHoyISO(timeZone = DEFAULT_TIMEZONE, ahora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);

  const valores = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function parseDateOnly(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new Error("Fecha inválida.");
    return new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
  }

  if (typeof valor !== "string" || !DATE_ONLY_REGEX.test(valor)) {
    throw new Error(`Fecha inválida: ${valor}. Usa el formato AAAA-MM-DD.`);
  }

  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    throw new Error(`Fecha inexistente: ${valor}.`);
  }

  return fecha;
}

function isValidDateOnly(valor) {
  try {
    parseDateOnly(valor);
    return true;
  } catch {
    return false;
  }
}

function formatDateOnly(fecha) {
  const d = parseDateOnly(fecha);
  const anio = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function addDaysDateOnly(fecha, dias) {
  const d = parseDateOnly(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return formatDateOnly(d);
}

function compareDateOnly(a, b) {
  return Math.sign(parseDateOnly(a).getTime() - parseDateOnly(b).getTime());
}

function diaSemanaDateOnly(fecha) {
  return parseDateOnly(fecha).getUTCDay();
}

function partesDateOnly(fecha) {
  const d = parseDateOnly(fecha);
  return {
    anio: d.getUTCFullYear(),
    mesIndiceCero: d.getUTCMonth(),
    dia: d.getUTCDate(),
  };
}

module.exports = {
  DATE_ONLY_REGEX,
  DEFAULT_TIMEZONE,
  fechaHoyISO,
  parseDateOnly,
  isValidDateOnly,
  formatDateOnly,
  addDaysDateOnly,
  compareDateOnly,
  diaSemanaDateOnly,
  partesDateOnly,
};
