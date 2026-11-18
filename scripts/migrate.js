const { sequelize, connectDatabase } = require("../src/config/database");

// Cargar todos los modelos antes de migrar/validar.
require("../src/models");
const { runMigrations } = require("../src/migrations/runner");

(async () => {
  try {
    await connectDatabase();
    const result = await runMigrations(sequelize);
    console.log(`Migraciones ejecutadas: ${result.executed.length}`);
    for (const name of result.executed) console.log(`  + ${name}`);
    process.exitCode = 0;
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
