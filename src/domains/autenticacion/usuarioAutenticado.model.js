const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class UsuarioAutenticado extends Model {}

UsuarioAutenticado.init(
  {
    telegramId: { type: DataTypes.STRING, primaryKey: true },
    cedulaRuc: { type: DataTypes.STRING, allowNull: false },
    nombre: { type: DataTypes.STRING, allowNull: false },
    correoElectronico: { type: DataTypes.STRING, allowNull: false },
    rol: {
      type: DataTypes.ENUM(
        "solicitante",
        "contadora",
        "colecturia",
        "coordinador_general",
        "cash_management",
        "director_general",
        "asistente_contable",
        "coordinador_carrera",
        "rector",
        "vicerector_postgrado",
        "vicerector_financiero"
      ),
      allowNull: false,
      defaultValue: "solicitante",
    },
    autenticadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "UsuarioAutenticado",
    tableName: "usuarios_autenticados",
    timestamps: false,
  }
);

module.exports = UsuarioAutenticado;
