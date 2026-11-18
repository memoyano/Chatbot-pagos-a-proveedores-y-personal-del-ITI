const { Sequelize } = require("sequelize");
const config = require("./env");
const logger = require("../utils/logger");
const { setRuntimeState } = require("./runtimeState");

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: "mysql",
  logging: (msg) => logger.debug(msg),
  dialectOptions: {
    ...(config.db.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
    connectTimeout: config.db.connectTimeoutMs,
  },
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  retry: { max: 2 },
});

async function connectDatabase() {
  await sequelize.authenticate();
  setRuntimeState({ databaseConnected: true });
  logger.info("Conexión a MySQL establecida correctamente");
}

module.exports = { sequelize, connectDatabase };
