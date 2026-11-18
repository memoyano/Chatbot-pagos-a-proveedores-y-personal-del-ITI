const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class TelegramUpdate extends Model {}

TelegramUpdate.init(
  {
    updateId: { type: DataTypes.BIGINT, primaryKey: true },
    status: {
      type: DataTypes.ENUM("processing", "completed", "failed"),
      allowNull: false,
      defaultValue: "processing",
    },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    lockedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    processedAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(1000), allowNull: true },
  },
  {
    sequelize,
    modelName: "TelegramUpdate",
    tableName: "telegram_updates",
    timestamps: true,
    indexes: [
      { fields: ["status"] },
      { fields: ["updatedAt"] },
    ],
  }
);

module.exports = TelegramUpdate;
