const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class RolPagoDocentes extends Model {}

RolPagoDocentes.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    periodo: { type: DataTypes.STRING, allowNull: false },
    estado: {
      type: DataTypes.ENUM(
        "matrices_recibidas",
        "rol_elaborado",
        "facturas_solicitadas",
        "documentacion_revisada",
        "detalle_generado",
        "orden_generada",
        "pagado"
      ),
      allowNull: false,
      defaultValue: "matrices_recibidas",
    },
    fechaMatricesRecibidas: { type: DataTypes.DATEONLY, allowNull: false },
    fechaRolElaborado: { type: DataTypes.DATE, allowNull: true },
    fechaFacturasSolicitadas: { type: DataTypes.DATEONLY, allowNull: true },
    fechaDocumentacionRevisada: { type: DataTypes.DATE, allowNull: true },
    creadoPorTelegramId: { type: DataTypes.STRING, allowNull: false },

    pagoRezagadosEstado: {
      type: DataTypes.ENUM("no_iniciado", "preparado", "orden_generada", "pagado"),
      allowNull: false,
      defaultValue: "no_iniciado",
    },
    fechaPreparacionRezagados: { type: DataTypes.DATE, allowNull: true },
    fechaOrdenRezagados: { type: DataTypes.DATE, allowNull: true },
    fechaPagoRezagados: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: "RolPagoDocentes", tableName: "roles_pago_docentes", timestamps: true }
);

module.exports = RolPagoDocentes;
