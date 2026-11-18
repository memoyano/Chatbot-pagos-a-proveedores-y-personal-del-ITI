const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class NovedadDocente extends Model {}

NovedadDocente.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    docenteCedula: { type: DataTypes.STRING, allowNull: false },
    gradoProfesionalPropuesto: { type: DataTypes.STRING, allowNull: false },
    valorHoraPropuesto: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
    motivo: { type: DataTypes.TEXT, allowNull: true },
    estado: {
      type: DataTypes.ENUM("pendiente", "aprobada", "rechazada"),
      allowNull: false,
      defaultValue: "pendiente",
    },
    reportadoPorTelegramId: { type: DataTypes.STRING, allowNull: false },
    reportadoPorNombre: { type: DataTypes.STRING, allowNull: false },
    decididoPorTelegramId: { type: DataTypes.STRING, allowNull: true },
    decididoPorNombre: { type: DataTypes.STRING, allowNull: true },
    fechaDecision: { type: DataTypes.DATE, allowNull: true },
    observacionDecision: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, modelName: "NovedadDocente", tableName: "novedades_docentes", timestamps: true }
);

module.exports = NovedadDocente;
