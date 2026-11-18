const { DataTypes } = require("sequelize");

const ROLES = [
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
  "vicerector_financiero",
];

module.exports = {
  name: "202610090001-roles-autoridad-excepcional",

  async up({ queryInterface }) {
    await queryInterface.changeColumn("erp_replica", "rol", {
      type: DataTypes.ENUM(...ROLES),
      allowNull: false,
      defaultValue: "solicitante",
    });

    await queryInterface.changeColumn("usuarios_autenticados", "rol", {
      type: DataTypes.ENUM(...ROLES),
      allowNull: false,
      defaultValue: "solicitante",
    });
  },
};