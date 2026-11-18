/**
 * Prueba la conexión a la base de datos usando las credenciales del .env
 * y da un diagnóstico legible si algo falla.
 *
 * Uso:  node scripts/test-connection.js
 */
const { sequelize } = require("../src/config/database");
const config = require("../src/config/env");

async function main() {
  console.log("Probando conexión con:");
  console.log(`  Host: ${config.db.host}`);
  console.log(`  Puerto: ${config.db.port}`);
  console.log(`  Base de datos: ${config.db.name}`);
  console.log(`  Usuario: ${config.db.user}`);
  console.log(`  SSL: ${config.db.ssl}`);
  console.log("");

  try {
    await sequelize.authenticate();
    console.log("✅ Conexión exitosa. Las credenciales y la red están correctamente configuradas.");
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error("❌ No se pudo conectar.\n");

    if (err.original?.code === "ETIMEDOUT" || err.message.includes("ETIMEDOUT")) {
      console.error(
        "Causa probable: el firewall del servidor Azure MySQL no permite tu IP actual.\n" +
          "Solución: Portal de Azure → tu servidor → Redes → agrega tu IP de cliente actual\n" +
          "(tu IP pudo haber cambiado desde que creaste el servidor)."
      );
    } else if (err.original?.code === "ER_ACCESS_DENIED_ERROR" || err.message.includes("Access denied")) {
      console.error(
        "Causa probable: usuario o contraseña incorrectos en el .env.\n" +
          "Solución: verifica DB_USER y DB_PASSWORD contra lo que definiste en el portal de Azure\n" +
          "(en Flexible Server el usuario NO lleva '@nombre-servidor', solo el nombre simple)."
      );
    } else if (err.message.includes("ER_NOT_SUPPORTED_AUTH_MODE")) {
      console.error(
        "Causa probable: el plugin de autenticación no es compatible.\n" +
          "Solución: asegúrate de usar mysql2 (ya incluido) y MySQL 8.0 en el servidor."
      );
    } else if (err.message.toLowerCase().includes("ssl") || err.message.includes("HANDSHAKE")) {
      console.error(
        "Causa probable: falta configurar SSL.\n" +
          "Solución: en tu .env, establece DB_SSL=true (Azure MySQL exige conexión cifrada)."
      );
    } else if (err.original?.code === "ENOTFOUND") {
      console.error(
        "Causa probable: el DB_HOST está mal escrito.\n" +
          "Solución: copia exactamente el 'Nombre del servidor' desde el portal de Azure,\n" +
          "debe terminar en .mysql.database.azure.com"
      );
    } else {
      console.error("Detalle del error:", err.message);
    }

    process.exit(1);
  }
}

main();
