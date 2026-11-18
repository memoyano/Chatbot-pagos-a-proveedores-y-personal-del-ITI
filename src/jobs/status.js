const estados = new Map();

function registrarProgramado(nombre, schedule) {
  const previo = estados.get(nombre) || {};
  estados.set(nombre, { ...previo, nombre, schedule, enabled: true, running: false });
}
function registrarInicio(nombre, schedule) {
  const previo = estados.get(nombre) || {};
  estados.set(nombre, { ...previo, nombre, schedule, lastStartedAt: new Date().toISOString(), running: true });
}
function registrarExito(nombre, resultado = null) {
  const previo = estados.get(nombre) || { nombre };
  estados.set(nombre, { ...previo, lastSuccessAt: new Date().toISOString(), lastResult: resultado, lastError: null, running: false });
}
function registrarError(nombre, error) {
  const previo = estados.get(nombre) || { nombre };
  estados.set(nombre, { ...previo, lastErrorAt: new Date().toISOString(), lastError: error?.message || String(error), running: false });
}
function obtenerEstados() {
  return Array.from(estados.values());
}
module.exports = { registrarProgramado, registrarInicio, registrarExito, registrarError, obtenerEstados };
