const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("/help reutiliza el menú global de /start", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/bot/index.js"), "utf8");
  assert.match(source, /bot\.start\(responderMenu\)/);
  assert.match(source, /bot\.command\("help", responderMenu\)/);
});

test("IA se registra antes de los flows con handlers de texto", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/bot/index.js"), "utf8");
  const ia = source.indexOf("registerIAFlow(bot);");
  const solicitud = source.indexOf("registerSolicitudPagoFlow(bot);");
  assert.ok(ia >= 0, "registerIAFlow(bot) debe existir");
  assert.ok(solicitud >= 0, "registerSolicitudPagoFlow(bot) debe existir");
  assert.ok(ia < solicitud, "IA global debe registrarse antes de los flows de captura");
});

test("/iaestado sigue registrado en ia.flow", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/bot/flows/ia.flow.js"), "utf8");
  assert.match(source, /bot\.command\("iaestado"/);
});
