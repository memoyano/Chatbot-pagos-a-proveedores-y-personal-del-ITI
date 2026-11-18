const { Op } = require("sequelize");
const AnalisisIA = require("./analisisIA.model");

async function crearPendiente({ entidadTipo, entidadId = null, tipoAnalisis, proveedor, modelo = null, actor = {}, inputHash = null, metadata = null }) {
  return AnalisisIA.create({
    entidadTipo,
    entidadId,
    tipoAnalisis,
    proveedor,
    modelo,
    estado: "pendiente",
    actorTelegramId: actor.telegramId ? String(actor.telegramId) : null,
    actorNombre: actor.nombre || null,
    inputHash,
    metadata,
  });
}

async function completar(id, { confianza = null, recomendacion = null, datosExtraidos = null, alertas = [], metadata = null, proveedor = null, modelo = null } = {}) {
  const row = await AnalisisIA.findByPk(id);
  if (!row) return null;
  await row.update({
    estado: "completado",
    confianza,
    recomendacion,
    datosExtraidos,
    alertas,
    metadata: metadata ?? row.metadata,
    proveedor: proveedor || row.proveedor,
    modelo: modelo || row.modelo,
    error: null,
  });
  return row;
}

async function fallar(id, error) {
  const row = await AnalisisIA.findByPk(id);
  if (!row) return null;
  await row.update({ estado: "error", error: String(error?.message || error).slice(0, 4000) });
  return row;
}

async function obtener(id) {
  return AnalisisIA.findByPk(id);
}

async function ultimoPorEntidad(entidadTipo, entidadId, tipoAnalisis = "documento") {
  return AnalisisIA.findOne({
    where: { entidadTipo, entidadId, tipoAnalisis, estado: "completado" },
    order: [["createdAt", "DESC"]],
  });
}

async function ultimosErrores(limit = 10) {
  return AnalisisIA.findAll({
    where: { estado: "error", createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    order: [["createdAt", "DESC"]],
    limit,
  });
}

module.exports = { crearPendiente, completar, fallar, obtener, ultimoPorEntidad, ultimosErrores };
