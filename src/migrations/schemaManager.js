const config = require("../config/env");
const logger = require("../utils/logger");
const { runMigrations } = require("./runner");
const { validarModelosContraSchema } = require("./schemaValidator");

async function prepararSchema(sequelize, mode = config.db.schemaMode) {
  if (mode === "migrate") {
    const result = await runMigrations(sequelize, { validateAfter: true });
    logger.info("Migraciones listas", { executed: result.executed.length, total: result.total });
    return result;
  }

  if (mode === "validate") {
    return validarModelosContraSchema(sequelize);
  }

  if (mode === "sync") {
    await sequelize.sync({ force: false, alter: false });
    return validarModelosContraSchema(sequelize);
  }

  if (mode === "sync-alter") {
    await sequelize.sync({ alter: true });
    return validarModelosContraSchema(sequelize);
  }

  throw new Error(`Modo de esquema no soportado: ${mode}`);
}

module.exports = { prepararSchema };
