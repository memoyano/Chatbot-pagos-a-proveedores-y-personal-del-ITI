const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class OtpVerificacion extends Model {}

OtpVerificacion.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    telegramId: { type: DataTypes.STRING, allowNull: false },
    cedulaRuc: { type: DataTypes.STRING, allowNull: false },
    otpHash: { type: DataTypes.STRING, allowNull: false },
    intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    expiraEn: { type: DataTypes.DATE, allowNull: false },
    usado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "OtpVerificacion",
    tableName: "otp_verificaciones",
    timestamps: true,
  }
);

module.exports = OtpVerificacion;
