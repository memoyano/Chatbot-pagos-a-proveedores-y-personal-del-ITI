const { sequelize } = require("../src/config/database");
const Docente = require("../src/domains/docentes/docente.model");

const REGISTROS = [
  {
    cedula: "1755555555",
    nombre: "Docente de Prueba Uno",
    correoElectronico: "docente1@example.com",
    gradoProfesional: "Magíster",
    valorHoraClase: 12.5,
  },
  {
    cedula: "1766666666",
    nombre: "Docente de Prueba Dos",
    correoElectronico: "docente2@example.com",
    gradoProfesional: "PhD",
    valorHoraClase: 18.0,
  },
];

async function main() {
  await sequelize.authenticate();
  await Docente.sync();

  for (const registro of REGISTROS) {
    const [d, creado] = await Docente.upsert(registro);
    console.log(`${creado ? "Creado" : "Actualizado"}: ${d.cedula} — ${d.nombre}`);
  }

  console.log("\nListo.");
  await sequelize.close();
}

main().catch((err) => {
  console.error("Error al poblar docentes de prueba:", err.message);
  process.exit(1);
});
