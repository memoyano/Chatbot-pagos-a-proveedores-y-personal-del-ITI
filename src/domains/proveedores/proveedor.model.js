const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class Proveedor extends Model {}

Proveedor.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombreTitularCuenta: { type: DataTypes.STRING, allowNull: false },
    rucCedula: { type: DataTypes.STRING, allowNull: false, unique: true },
    institucionFinanciera: { type: DataTypes.STRING, allowNull: false },
    tipoCuenta: { type: DataTypes.ENUM("ahorros", "corriente"), allowNull: false },
    numeroCuenta: { type: DataTypes.STRING, allowNull: false },
    correoElectronico: { type: DataTypes.STRING, allowNull: false },
    registradoPorTelegramId: { type: DataTypes.STRING, allowNull: false },
  },
  {
    sequelize,
    modelName: "Proveedor",
    tableName: "proveedores",
    timestamps: true,
  }
);

module.exports = Proveedor;
