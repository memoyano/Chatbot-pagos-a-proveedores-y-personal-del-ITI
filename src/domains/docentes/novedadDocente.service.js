const NovedadDocente = require("./novedadDocente.model");
const Docente = require("./docente.model");

async function reportar({ docenteCedula, gradoProfesionalPropuesto, valorHoraPropuesto, motivo, usuario }) {
  const docente = await Docente.findByPk(docenteCedula);
  if (!docente) return { error: `No se encontró un docente con cédula ${docenteCedula}.` };

  const novedad = await NovedadDocente.create({
    docenteCedula,
    gradoProfesionalPropuesto,
    valorHoraPropuesto: valorHoraPropuesto ?? null,
    motivo: motivo || null,
    reportadoPorTelegramId: String(usuario.telegramId),
    reportadoPorNombre: usuario.nombre,
    estado: "pendiente",
  });
  return { novedad, docente };
}

async function listarPendientes() {
  return NovedadDocente.findAll({ where: { estado: "pendiente" }, order: [["createdAt", "ASC"]] });
}

async function aprobar(id, usuario) {
  const novedad = await NovedadDocente.findByPk(id);
  if (!novedad) return { error: `No existe la novedad #${id}.` };
  if (novedad.estado !== "pendiente") return { error: `La novedad #${id} ya está ${novedad.estado}.` };

  const docente = await Docente.findByPk(novedad.docenteCedula);
  if (!docente) return { error: `Ya no existe el docente ${novedad.docenteCedula}.` };

  await docente.update({
    gradoProfesional: novedad.gradoProfesionalPropuesto,
    valorHoraClase: novedad.valorHoraPropuesto ?? docente.valorHoraClase,
  });
  await novedad.update({
    estado: "aprobada",
    decididoPorTelegramId: String(usuario.telegramId),
    decididoPorNombre: usuario.nombre,
    fechaDecision: new Date(),
  });
  return { novedad, docente };
}

async function rechazar(id, usuario, motivo) {
  const novedad = await NovedadDocente.findByPk(id);
  if (!novedad) return { error: `No existe la novedad #${id}.` };
  if (novedad.estado !== "pendiente") return { error: `La novedad #${id} ya está ${novedad.estado}.` };
  await novedad.update({
    estado: "rechazada",
    decididoPorTelegramId: String(usuario.telegramId),
    decididoPorNombre: usuario.nombre,
    fechaDecision: new Date(),
    observacionDecision: motivo || "Sin observación",
  });
  return { novedad };
}

module.exports = { reportar, listarPendientes, aprobar, rechazar };
