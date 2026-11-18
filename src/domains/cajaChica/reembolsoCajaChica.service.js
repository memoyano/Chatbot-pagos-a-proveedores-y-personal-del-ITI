const ReembolsoCajaChica = require("./reembolsoCajaChica.model");
const rules = require("../../rules/politicaPagos.rules");
const { fechaHoyISO } = require("../../utils/fechas");
const logger = require("../../utils/logger");

async function registrarReembolso(datos) {
  const evaluacion = rules.evaluarReembolsoCajaChica({
    fechaPresentacion: datos.fechaPresentacion,
  });

  const reembolso = await ReembolsoCajaChica.create({
    descripcion: datos.descripcion,
    montoTotal: datos.montoTotal,
    rutaRespaldo: datos.rutaRespaldo,
    fechaPresentacion: datos.fechaPresentacion,
    fechaLimite: evaluacion.fechaLimite,
    periodoPresentacion: evaluacion.periodoPresentacion,
    periodoProcesamiento: evaluacion.periodoProcesamiento,
    dentroPlazo: evaluacion.dentroPlazo,
    diferido: evaluacion.diferido,
    motivoDiferimiento: evaluacion.motivo,
    estado: "pendiente_revision",
    solicitanteTelegramId: String(datos.solicitanteTelegramId),
    solicitanteNombre: datos.solicitanteNombre,
  });

  logger.info("Reembolso de Caja Chica registrado", {
    id: reembolso.id,
    periodoProcesamiento: reembolso.periodoProcesamiento,
    diferido: reembolso.diferido,
  });
  return { reembolso, evaluacion };
}

async function obtenerPorId(id) {
  return ReembolsoCajaChica.findByPk(id);
}

async function listarPorSolicitante(telegramId) {
  return ReembolsoCajaChica.findAll({
    where: { solicitanteTelegramId: String(telegramId) },
    order: [["createdAt", "DESC"]],
    limit: 15,
  });
}

async function listarParaRevision() {
  return ReembolsoCajaChica.findAll({
    where: { estado: ["pendiente_revision", "observado"] },
    order: [["createdAt", "ASC"]],
  });
}

async function revisarReembolso(
  id,
  { accion, observacion, revisorTelegramId, revisorNombre }
) {
  const reembolso = await obtenerPorId(id);
  if (!reembolso) return { error: `No existe el reembolso de Caja Chica #${id}.` };
  if (!["pendiente_revision", "observado"].includes(reembolso.estado)) {
    return {
      error: `El reembolso #${id} está en estado "${reembolso.estado}" y ya no admite esta revisión.`,
    };
  }

  let estado;
  if (accion === "aprobar") estado = "aprobado";
  else if (accion === "observar") estado = "observado";
  else if (accion === "rechazar") estado = "rechazado";
  else return { error: `Acción de revisión no reconocida: ${accion}.` };

  if (["observar", "rechazar"].includes(accion) && !observacion?.trim()) {
    return { error: "Debes indicar el motivo u observación." };
  }

  await reembolso.update({
    estado,
    observacionRevision: observacion?.trim() || null,
    revisadoPorTelegramId: String(revisorTelegramId),
    revisadoPorNombre: revisorNombre,
    fechaRevision: new Date(),
  });

  logger.info("Reembolso de Caja Chica revisado", { id, accion, estado });
  return { reembolso };
}

async function corregirRespaldo(id, telegramId, rutaRespaldo) {
  const reembolso = await obtenerPorId(id);
  if (!reembolso) return { error: `No existe el reembolso de Caja Chica #${id}.` };
  if (String(reembolso.solicitanteTelegramId) !== String(telegramId)) {
    return { error: "Solo quien registró el reembolso puede corregir su respaldo." };
  }
  if (reembolso.estado !== "observado") {
    return { error: `El reembolso #${id} no está observado y no requiere corrección.` };
  }
  if (!rutaRespaldo) return { error: "Debes adjuntar un nuevo respaldo." };

  await reembolso.update({
    rutaRespaldo,
    estado: "pendiente_revision",
    observacionRevision: null,
    revisadoPorTelegramId: null,
    revisadoPorNombre: null,
    fechaRevision: null,
  });

  logger.info("Respaldo de Caja Chica corregido", { id });
  return { reembolso };
}

async function marcarReembolsado(
  id,
  { fechaReembolso = fechaHoyISO(), ejecutorTelegramId, ejecutorNombre }
) {
  const reembolso = await obtenerPorId(id);
  if (!reembolso) return { error: `No existe el reembolso de Caja Chica #${id}.` };
  if (reembolso.estado !== "aprobado") {
    return { error: `El reembolso #${id} está en estado "${reembolso.estado}" y aún no puede ejecutarse.` };
  }

  const periodoActual = rules.periodoContableDeFecha(fechaReembolso);
  if (periodoActual < reembolso.periodoProcesamiento) {
    return {
      error:
        `El reembolso #${id} fue diferido al período ${reembolso.periodoProcesamiento} ` +
        `y no puede procesarse todavía (período actual: ${periodoActual}).`,
    };
  }

  await reembolso.update({
    estado: "reembolsado",
    fechaReembolso,
    reembolsadoPorTelegramId: String(ejecutorTelegramId),
    reembolsadoPorNombre: ejecutorNombre,
  });

  logger.info("Reembolso de Caja Chica ejecutado", { id, fechaReembolso });
  return { reembolso };
}

module.exports = {
  registrarReembolso,
  obtenerPorId,
  listarPorSolicitante,
  listarParaRevision,
  revisarReembolso,
  corregirRespaldo,
  marcarReembolsado,
};
