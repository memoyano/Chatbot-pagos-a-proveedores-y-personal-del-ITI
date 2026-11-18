const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class AuditoriaEvento extends Model {}

AuditoriaEvento.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    entidad: { type: DataTypes.STRING(80), allowNull: false },
    entidadId: { type: DataTypes.STRING(120), allowNull: true },
    accion: { type: DataTypes.STRING(80), allowNull: false },
    estadoAnterior: { type: DataTypes.STRING(100), allowNull: true },
    estadoNuevo: { type: DataTypes.STRING(100), allowNull: true },
    actorTelegramId: { type: DataTypes.STRING, allowNull: true },
    actorNombre: { type: DataTypes.STRING(200), allowNull: false, defaultValue: "Sistema" },
    actorRol: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "sistema" },
    origen: {
      type: DataTypes.ENUM("telegram", "job", "sistema"),
      allowNull: false,
      defaultValue: "sistema",
    },
    detalle: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: "AuditoriaEvento",
    tableName: "auditoria_eventos",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["entidad", "entidadId"] },
      { fields: ["actorTelegramId"] },
      { fields: ["createdAt"] },
    ],
  }
);

module.exports = AuditoriaEvento;
