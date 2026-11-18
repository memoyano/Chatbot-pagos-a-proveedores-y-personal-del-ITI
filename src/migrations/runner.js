const path = require("path");
const logger = require("../utils/logger");
const { validarModelosContraSchema } = require("./schemaValidator");
const { listMigrationFiles, checksumFor } = require("./utils");

const MIGRATION_TABLE = "schema_migrations";
const LOCK_NAME = "chatbot_iti_schema_migrations";

function migrationFiles() {
  return listMigrationFiles(__dirname);
}

async function ensureMigrationTable(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      name VARCHAR(191) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      appliedAt DATETIME NOT NULL
    ) ENGINE=InnoDB;
  `);
}

async function acquireLock(sequelize) {
  const [rows] = await sequelize.query("SELECT GET_LOCK(?, 30) AS locked", { replacements: [LOCK_NAME] });
  const locked = Number(rows?.[0]?.locked || 0);
  if (locked !== 1) throw new Error("No fue posible obtener el lock de migraciones en 30 segundos.");
}

async function releaseLock(sequelize) {
  try {
    await sequelize.query("SELECT RELEASE_LOCK(?)", { replacements: [LOCK_NAME] });
  } catch (_) {}
}

async function obtenerMigracionesAplicadas(sequelize) {
  await ensureMigrationTable(sequelize);
  const [rows] = await sequelize.query(`SELECT name, checksum, appliedAt FROM ${MIGRATION_TABLE} ORDER BY name`);
  return rows;
}

async function runMigrations(sequelize, { validateAfter = true } = {}) {
  await acquireLock(sequelize);
  try {
    await ensureMigrationTable(sequelize);
    const appliedRows = await obtenerMigracionesAplicadas(sequelize);
    const applied = new Map(appliedRows.map((r) => [r.name, r]));
    const files = migrationFiles();
    const executed = [];

    for (const file of files) {
      const filePath = path.join(__dirname, file);
      const migration = require(filePath);
      const name = migration.name || file.replace(/\.js$/, "");
      const checksum = checksumFor(filePath);
      const existing = applied.get(name);

      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(`La migración aplicada ${name} fue modificada después de ejecutarse. No se continuará.`);
        }
        continue;
      }

      logger.info("Ejecutando migración", { migration: name });
      await migration.up({ sequelize, queryInterface: sequelize.getQueryInterface() });
      await sequelize.query(
        `INSERT INTO ${MIGRATION_TABLE} (name, checksum, appliedAt) VALUES (?, ?, NOW())`,
        { replacements: [name, checksum] }
      );
      executed.push(name);
      logger.info("Migración aplicada", { migration: name });
    }

    if (validateAfter) await validarModelosContraSchema(sequelize);
    return { executed, total: files.length };
  } finally {
    await releaseLock(sequelize);
  }
}

async function migrationStatus(sequelize) {
  const appliedRows = await obtenerMigracionesAplicadas(sequelize);
  const applied = new Map(appliedRows.map((r) => [r.name, r]));
  return migrationFiles().map((file) => {
    const filePath = path.join(__dirname, file);
    const migration = require(filePath);
    const name = migration.name || file.replace(/\.js$/, "");
    const checksum = checksumFor(filePath);
    const row = applied.get(name);
    return {
      name,
      applied: Boolean(row),
      checksumOk: !row || row.checksum === checksum,
      appliedAt: row?.appliedAt || null,
    };
  });
}

module.exports = { runMigrations, migrationStatus, migrationFiles, checksumFor, MIGRATION_TABLE };
