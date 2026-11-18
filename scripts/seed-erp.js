const { sequelize } = require("../src/config/database");
const ErpReplica = require("../src/domains/erp/erpReplica.model");

const REGISTROS = [
  {
    cedulaRuc: "1712345678",
    nombre: "Solicitante de Prueba",
    correoElectronico: "solicitante@example.com",
    rol: "solicitante",
  },
  {
    cedulaRuc: "1798765432",
    nombre: "Contadora de Prueba",
    correoElectronico: "contadora@example.com",
    rol: "contadora",
  },
  {
    cedulaRuc: "1711111111",
    nombre: "Colecturía ITI",
    correoElectronico: "colecturia@example.com",
    rol: "colecturia",
  },
  {
    cedulaRuc: "1722222222",
    nombre: "Coordinador General",
    correoElectronico: "coordinacion@example.com",
    rol: "coordinador_general",
  },
  {
    cedulaRuc: "1733333333",
    nombre: "Cash Management",
    correoElectronico: "caja@example.com",
    rol: "cash_management",
  },
  {
    cedulaRuc: "1744444444",
    nombre: "Director General de Prueba",
    correoElectronico: "direccion@example.com",
    rol: "director_general",
  },
  {
    cedulaRuc: "1755556666",
    nombre: "Asistente Contable",
    correoElectronico: "asistente@example.com",
    rol: "asistente_contable",
  },
  {
    cedulaRuc: "1766667777",
    nombre: "Coordinador de Carrera",
    correoElectronico: "carrera@example.com",
    rol: "coordinador_carrera",
  },
  {
    cedulaRuc: "1777777777",
    nombre: "Rector/a",
    correoElectronico: "reemplaza-con-correo-rector@iti.edu.ec",
    rol: "rector",
  },
  {
    cedulaRuc: "1788888888",
    nombre: "Vicerector/a Postgrado",
    correoElectronico: "reemplaza-con-correo-postgrado@iti.edu.ec",
    rol: "vicerector_postgrado",
  },
  {
    cedulaRuc: "1799999999",
    nombre: "Vicerector/a Financiero/a",
    correoElectronico: "reemplaza-con-correo-financiero@iti.edu.ec",
    rol: "vicerector_financiero",
  },
];

async function main() {
  await sequelize.authenticate();
  await ErpReplica.sync();

  for (const registro of REGISTROS) {
    const [erp, creado] = await ErpReplica.upsert(registro);
    console.log(`${creado ? "Creado" : "Actualizado"}: ${erp.cedulaRuc} — ${erp.nombre} (${erp.rol})`);
  }

  console.log("\nListo. Puedes autenticarte con cualquiera de estas cédulas para probar cada rol.");
  await sequelize.close();
}

main().catch((err) => {
  console.error("Error al poblar el ERP de prueba:", err.message);
  process.exit(1);
});
