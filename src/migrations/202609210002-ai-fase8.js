const { DataTypes } = require("sequelize");

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables
    .map((value) => typeof value === "string" ? value : (value?.tableName || value?.TABLE_NAME || String(value)))
    .includes(tableName);
}

module.exports = {
  name: "202609210002-ai-fase8",
  async up({ queryInterface }) {
    if (await tableExists(queryInterface, "analisis_ia")) return;
    await queryInterface.createTable("analisis_ia", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      entidadTipo: { type: DataTypes.ENUM("comprobante", "factura_docente", "mensaje"), allowNull: false },
      entidadId: { type: DataTypes.INTEGER, allowNull: true },
      tipoAnalisis: { type: DataTypes.ENUM("documento", "nlp_intent"), allowNull: false },
      proveedor: { type: DataTypes.ENUM("azure_document_intelligence", "azure_openai", "reglas_locales", "combinado"), allowNull: false },
      modelo: { type: DataTypes.STRING(120), allowNull: true },
      estado: { type: DataTypes.ENUM("pendiente", "completado", "error"), allowNull: false, defaultValue: "pendiente" },
      confianza: { type: DataTypes.DECIMAL(6, 5), allowNull: true },
      recomendacion: { type: DataTypes.ENUM("sin_alertas", "revisar", "no_concluyente"), allowNull: true },
      datosExtraidos: { type: DataTypes.JSON, allowNull: true },
      alertas: { type: DataTypes.JSON, allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: true },
      inputHash: { type: DataTypes.STRING(64), allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      actorTelegramId: { type: DataTypes.STRING, allowNull: true },
      actorNombre: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("analisis_ia", ["entidadTipo", "entidadId", "createdAt"], { name: "analisis_ia_entidad_idx" });
    await queryInterface.addIndex("analisis_ia", ["estado"], { name: "analisis_ia_estado_idx" });
    await queryInterface.addIndex("analisis_ia", ["tipoAnalisis", "createdAt"], { name: "analisis_ia_tipo_idx" });
  },
};
