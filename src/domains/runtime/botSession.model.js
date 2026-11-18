const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class BotSession extends Model {}

BotSession.init(
  {
    sessionKey: { type: DataTypes.STRING(191), primaryKey: true },
    data: { type: DataTypes.JSON, allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    modelName: "BotSession",
    tableName: "bot_sessions",
    timestamps: true,
    indexes: [{ fields: ["expiresAt"] }],
  }
);

module.exports = BotSession;
