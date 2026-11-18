const { sequelize, connectDatabase } = require("../src/config/database");
require("../src/models");
const { migrationStatus } = require("../src/migrations/runner");

(async () => {
  try {
    await connectDatabase();
    const rows = await migrationStatus(sequelize);
    for (const r of rows) {
      console.log(`${r.applied ? "✓" : "○"} ${r.name}${r.checksumOk ? "" : " [CHECKSUM CAMBIÓ]"}`);
    }
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
