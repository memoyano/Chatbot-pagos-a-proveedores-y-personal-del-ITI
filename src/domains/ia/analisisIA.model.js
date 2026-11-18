const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class AnalisisIA extends Model {}

AnalisisIA.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entidadTipo: {
      type: DataTypes.ENUM("comprobante", "factura_docente", "mensaje"),
      allowNull: false,
    },
    entidadId: { type: DataTypes.INTEGER, allowNull: true },
    tipoAnalisis: {
      type: DataTypes.ENUM("documento", "nlp_intent"),
      allowNull: false,
    },
    proveedor: {
      type: DataTypes.ENUM("azure_document_intelligence", "azure_openai", "reglas_locales", "combinado"),
      allowNull: false,
    },
    modelo: { type: DataTypes.STRING(120), allowNull: true },
    estado: {
      type: DataTypes.ENUM("pendiente", "completado", "error"),
      allowNull: false,
      defaultValue: "pendiente",
    },
    confianza: { type: DataTypes.DECIMAL(6, 5), allowNull: true },
    recomendacion: {
      type: DataTypes.ENUM("sin_alertas", "revisar", "no_concluyente"),
      allowNull: true,
    },
    datosExtraidos: { type: DataTypes.JSON, allowNull: true },
    alertas: { type: DataTypes.JSON, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    inputHash: { type: DataTypes.STRING(64), allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    actorTelegramId: { type: DataTypes.STRING, allowNull: true },
    actorNombre: { type: DataTypes.STRING, allowNull: true },
  },
  {
    sequelize,
    modelName: "AnalisisIA",
    tableName: "analisis_ia",
    timestamps: true,
    indexes: [
      { fields: ["entidadTipo", "entidadId", "createdAt"] },
      { fields: ["estado"] },
      { fields: ["tipoAnalisis", "createdAt"] },
    ],
  }
);

module.exports = AnalisisIA;
