const { Op } = require("sequelize");
const AuditoriaEvento = require("./auditoriaEvento.model");
const { actorActual } = require("./auditoria.context");
const logger = require("../../utils/logger");

async function registrarAuditoria({
  entidad,
  entidadId = null,
  accion,
  estadoAnterior = null,
  estadoNuevo = null,
  detalle = null,
  actor = null,
}) {
  const a = actor || actorActual();
  try {
    return await AuditoriaEvento.create({
      entidad,
      entidadId: entidadId == null ? null : String(entidadId),
      accion,
      estadoAnterior: estadoAnterior == null ? null : String(estadoAnterior),
      estadoNuevo: estadoNuevo == null ? null : String(estadoNuevo),
      actorTelegramId: a.telegramId == null ? null : String(a.telegramId),
      actorNombre: a.nombre || "Sistema",
      actorRol: a.rol || "sistema",
      origen: a.origen || "sistema",
      detalle,
    });
  } catch (error) {
    logger.warn("No fue posible registrar auditoría", {
      entidad,
      entidadId,
      accion,
      error: error.message,
    });
    return null;
  }
}

async function listarPorEntidad(entidad, entidadId, limite = 30) {
  return AuditoriaEvento.findAll({
    where: { entidad, entidadId: String(entidadId) },
    order: [["createdAt", "DESC"]],
    limit: Math.min(Math.max(Number(limite) || 30, 1), 100),
  });
}

async function listarRecientes({ limite = 30, actorTelegramId = null, accion = null } = {}) {
  const where = {};
  if (actorTelegramId) where.actorTelegramId = String(actorTelegramId);
  if (accion) where.accion = { [Op.like]: `%${accion}%` };
  return AuditoriaEvento.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: Math.min(Math.max(Number(limite) || 30, 1), 100),
  });
}

module.exports = { registrarAuditoria, listarPorEntidad, listarRecientes };
