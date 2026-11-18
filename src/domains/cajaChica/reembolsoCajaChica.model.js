const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class ReembolsoCajaChica extends Model {}

ReembolsoCajaChica.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    descripcion: { type: DataTypes.TEXT, allowNull: false },
    montoTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    rutaRespaldo: { type: DataTypes.STRING, allowNull: false },

    fechaPresentacion: { type: DataTypes.DATEONLY, allowNull: false },
    fechaLimite: { type: DataTypes.DATEONLY, allowNull: false },
    periodoPresentacion: { type: DataTypes.STRING(7), allowNull: false },
    periodoProcesamiento: { type: DataTypes.STRING(7), allowNull: false },
    dentroPlazo: { type: DataTypes.BOOLEAN, allowNull: false },
    diferido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    motivoDiferimiento: { type: DataTypes.STRING(700), allowNull: true },

    estado: {
      type: DataTypes.ENUM("pendiente_revision", "observado", "aprobado", "rechazado", "reembolsado"),
      allowNull: false,
      defaultValue: "pendiente_revision",
    },
    observacionRevision: { type: DataTypes.STRING(1000), allowNull: true },
    revisadoPorTelegramId: { type: DataTypes.STRING, allowNull: true },
    revisadoPorNombre: { type: DataTypes.STRING, allowNull: true },
    fechaRevision: { type: DataTypes.DATE, allowNull: true },
    reembolsadoPorTelegramId: { type: DataTypes.STRING, allowNull: true },
    reembolsadoPorNombre: { type: DataTypes.STRING, allowNull: true },
    fechaReembolso: { type: DataTypes.DATEONLY, allowNull: true },

    solicitanteTelegramId: { type: DataTypes.STRING, allowNull: false },
    solicitanteNombre: { type: DataTypes.STRING, allowNull: false },
  },
  {
    sequelize,
    modelName: "ReembolsoCajaChica",
    tableName: "reembolsos_caja_chica",
    timestamps: true,
    indexes: [
      { fields: ["estado"] },
      { fields: ["periodoProcesamiento"] },
      { fields: ["solicitanteTelegramId"] },
    ],
  }
);

module.exports = ReembolsoCajaChica;
