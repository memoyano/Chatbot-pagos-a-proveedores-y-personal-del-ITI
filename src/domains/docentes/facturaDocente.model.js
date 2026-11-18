const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class FacturaDocente extends Model {}

FacturaDocente.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    rolPagoId: { type: DataTypes.INTEGER, allowNull: false },
    docenteCedula: { type: DataTypes.STRING, allowNull: false },

    conceptoSolicitado: { type: DataTypes.TEXT, allowNull: true },
    montoSolicitado: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

    fechaSolicitudFactura: { type: DataTypes.DATEONLY, allowNull: true },
    fechaLimiteFactura: { type: DataTypes.DATEONLY, allowNull: true },
    fechaRecepcionFactura: { type: DataTypes.DATEONLY, allowNull: true },

    numeroFactura: { type: DataTypes.STRING, allowNull: true },
    conceptoFactura: { type: DataTypes.TEXT, allowNull: true },
    montoFactura: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    rutaFactura: { type: DataTypes.TEXT, allowNull: true },

    conceptoCoincide: { type: DataTypes.BOOLEAN, allowNull: true },
    montoCoincide: { type: DataTypes.BOOLEAN, allowNull: true },
    elegiblePagoFinSemestre: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    correoEstado: {
      type: DataTypes.ENUM("no_enviado", "enviado", "error"),
      allowNull: false,
      defaultValue: "no_enviado",
    },
    correoEnviadoEn: { type: DataTypes.DATE, allowNull: true },
    correoError: { type: DataTypes.TEXT, allowNull: true },

    estado: {
      type: DataTypes.ENUM("preparacion", "pendiente", "recibida", "con_error", "rezagada", "pagada"),
      allowNull: false,
      defaultValue: "preparacion",
    },
    observacion: { type: DataTypes.TEXT, allowNull: true },

    pagadaEnCierreSemestre: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fechaPagoFinalSemestre: { type: DataTypes.DATEONLY, allowNull: true },
  },
  {
    sequelize,
    modelName: "FacturaDocente",
    tableName: "facturas_docentes",
    timestamps: true,
    indexes: [{ fields: ["rolPagoId", "docenteCedula"] }],
  }
);

module.exports = FacturaDocente;
