const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class Docente extends Model {}

Docente.init(
  {
    cedula: { type: DataTypes.STRING, primaryKey: true },
    nombre: { type: DataTypes.STRING, allowNull: false },
    correoElectronico: { type: DataTypes.STRING, allowNull: false },
    gradoProfesional: { type: DataTypes.STRING, allowNull: true },
    valorHoraClase: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, modelName: "Docente", tableName: "docentes", timestamps: true }
);

module.exports = Docente;
