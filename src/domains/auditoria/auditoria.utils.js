function nombreComando(texto) {
  if (!texto?.startsWith("/")) return null;
  return texto.trim().split(/\s+/)[0].split("@")[0].slice(1).toLowerCase() || null;
}

function camposSeguros(changed) {
  const prohibidos = new Set([
    "password",
    "otpHash",
    "token",
    "rutaArchivo",
    "rutaFactura",
    "rutaRespaldo",
    "rutaPlanificacionFinanciera",
    "rutaCedulaProveedor",
    "rutaLiquidacionCompra",
    "rutaRespaldoInternet",
    "rutaRespaldoTarjeta",
  ]);
  return (changed || []).filter((f) => !prohibidos.has(f));
}

module.exports = { nombreComando, camposSeguros };
