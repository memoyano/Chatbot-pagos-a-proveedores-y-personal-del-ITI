const { calcularExpiracionSesion } = require("../../rules/runtime.rules");

function createSequelizeSessionStore({ model, ttlHours = 72, now = () => new Date() } = {}) {
  const resolvedModel = model || require("./botSession.model");

  return {
    async get(key) {
      const row = await resolvedModel.findByPk(key);
      if (!row) return undefined;
      if (new Date(row.expiresAt).getTime() <= now().getTime()) {
        await row.destroy();
        return undefined;
      }
      return row.data;
    },

    async set(key, value) {
      const expiresAt = calcularExpiracionSesion(now(), ttlHours);
      await resolvedModel.upsert({ sessionKey: key, data: value, expiresAt });
    },

    async delete(key) {
      await resolvedModel.destroy({ where: { sessionKey: key } });
    },
  };
}

module.exports = { createSequelizeSessionStore };
