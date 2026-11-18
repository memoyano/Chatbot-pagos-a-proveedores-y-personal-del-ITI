const EventoInstitucional = require("./eventoInstitucional.model");
const rules = require("../../rules/politicaPagos.rules");
const logger = require("../../utils/logger");

async function registrarEvento(datos) {
  const validacion = rules.validarAnticipacionEvento({
    fechaPlanificacion: datos.fechaPresentacion,
    fechaEvento: datos.fechaEvento,
  });

  const evento = await EventoInstitucional.create({
    tipo: datos.tipo,
    nombre: datos.nombre,
    descripcion: datos.descripcion || null,
    unidadOrganizadora: datos.unidadOrganizadora,
    fechaPresentacion: datos.fechaPresentacion,
    fechaEvento: datos.fechaEvento,
    montoEstimado: datos.montoEstimado,
    rutaPlanificacionFinanciera: datos.rutaPlanificacionFinanciera,
    diasAnticipacion: validacion.dias,
    cumpleAnticipacion: validacion.valido,
    motivoIncumplimiento: validacion.motivo,
    estado: "pendiente_revision",
    solicitanteTelegramId: String(datos.solicitanteTelegramId),
    solicitanteNombre: datos.solicitanteNombre,
  });

  logger.info("Planificación de evento institucional registrada", {
    id: evento.id,
    cumpleAnticipacion: evento.cumpleAnticipacion,
    fechaEvento: evento.fechaEvento,
  });
  return { evento, validacion };
}

async function obtenerPorId(id) {
  return EventoInstitucional.findByPk(id);
}

async function listarPorSolicitante(telegramId) {
  return EventoInstitucional.findAll({
    where: { solicitanteTelegramId: String(telegramId) },
    order: [["createdAt", "DESC"]],
    limit: 15,
  });
}

async function listarParaRevision() {
  return EventoInstitucional.findAll({
    where: { estado: ["pendiente_revision", "observado"] },
    order: [["fechaEvento", "ASC"]],
  });
}

async function revisarEvento(
  id,
  { accion, observacion, revisorTelegramId, revisorNombre }
) {
  const evento = await obtenerPorId(id);
  if (!evento) return { error: `No existe el evento #${id}.` };
  if (!["pendiente_revision", "observado"].includes(evento.estado)) {
    return { error: `El evento #${id} está en estado "${evento.estado}" y ya no admite esta revisión.` };
  }

  if (accion === "aprobar" && !evento.cumpleAnticipacion) {
    return {
      error:
        `El evento #${id} no cumple la anticipación mínima de una semana (${evento.diasAnticipacion} día(s)). ` +
        "Debe corregirse la planificación antes de aprobarla.",
    };
  }

  let estado;
  if (accion === "aprobar") estado = "aprobado_programacion";
  else if (accion === "observar") estado = "observado";
  else if (accion === "rechazar") estado = "rechazado";
  else return { error: `Acción de revisión no reconocida: ${accion}.` };

  if (["observar", "rechazar"].includes(accion) && !observacion?.trim()) {
    return { error: "Debes indicar el motivo u observación." };
  }

  await evento.update({
    estado,
    observacionRevision: observacion?.trim() || null,
    revisadoPorTelegramId: String(revisorTelegramId),
    revisadoPorNombre: revisorNombre,
    fechaRevision: new Date(),
  });

  logger.info("Evento institucional revisado", { id, accion, estado });
  return { evento };
}

async function actualizarEventoObservado(id, telegramId, datos) {
  const evento = await obtenerPorId(id);
  if (!evento) return { error: `No existe el evento #${id}.` };
  if (String(evento.solicitanteTelegramId) !== String(telegramId)) {
    return { error: "Solo el responsable que registró el evento puede corregir su planificación." };
  }
  if (evento.estado !== "observado") {
    return { error: `El evento #${id} no está observado y no requiere corrección.` };
  }

  const validacion = rules.validarAnticipacionEvento({
    fechaPlanificacion: datos.fechaPresentacion,
    fechaEvento: datos.fechaEvento,
  });

  await evento.update({
    fechaPresentacion: datos.fechaPresentacion,
    fechaEvento: datos.fechaEvento,
    unidadOrganizadora: datos.unidadOrganizadora,
    nombre: datos.nombre,
    descripcion: datos.descripcion || null,
    montoEstimado: datos.montoEstimado,
    rutaPlanificacionFinanciera: datos.rutaPlanificacionFinanciera,
    diasAnticipacion: validacion.dias,
    cumpleAnticipacion: validacion.valido,
    motivoIncumplimiento: validacion.motivo,
    estado: "pendiente_revision",
    observacionRevision: null,
    revisadoPorTelegramId: null,
    revisadoPorNombre: null,
    fechaRevision: null,
  });

  logger.info("Planificación de evento corregida", { id, cumpleAnticipacion: validacion.valido });
  return { evento, validacion };
}

module.exports = {
  registrarEvento,
  obtenerPorId,
  listarPorSolicitante,
  listarParaRevision,
  revisarEvento,
  actualizarEventoObservado,
};
