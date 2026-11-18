const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class ErpReplica extends Model {}

ErpReplica.init(
  {
    cedulaRuc: { type: DataTypes.STRING, primaryKey: true },
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
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: "ErpReplica",
    tableName: "erp_replica",
    timestamps: true,
  }
);

module.exports = ErpReplica;
