const { DataTypes } = require("sequelize");

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => typeof t === "string" ? t : (t.tableName || t.TABLE_NAME || String(t))).includes(tableName);
}

module.exports = {
  name: "202609200002-runtime-hardening",
  async up({ queryInterface }) {
    if (!(await hasTable(queryInterface, "bot_sessions"))) {
      await queryInterface.createTable("bot_sessions", {
        sessionKey: { type: DataTypes.STRING(191), allowNull: false, primaryKey: true },
        data: { type: DataTypes.JSON, allowNull: false },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("bot_sessions", ["expiresAt"], { name: "bot_sessions_expires_at" });
    }

    if (!(await hasTable(queryInterface, "telegram_updates"))) {
      await queryInterface.createTable("telegram_updates", {
        updateId: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
        status: { type: DataTypes.ENUM("processing", "completed", "failed"), allowNull: false, defaultValue: "processing" },
        attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        lockedAt: { type: DataTypes.DATE, allowNull: false },
        processedAt: { type: DataTypes.DATE, allowNull: true },
        lastError: { type: DataTypes.STRING(1000), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("telegram_updates", ["status"], { name: "telegram_updates_status" });
      await queryInterface.addIndex("telegram_updates", ["updatedAt"], { name: "telegram_updates_updated_at" });
    }
  },
};
