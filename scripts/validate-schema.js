const { sequelize, connectDatabase } = require("../src/config/database");
require("../src/models");
const { validarModelosContraSchema } = require("../src/migrations/schemaValidator");

(async () => {
  try {
    await connectDatabase();
    const result = await validarModelosContraSchema(sequelize);
    console.log(`Esquema válido. Tablas verificadas: ${result.checked.length}`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
