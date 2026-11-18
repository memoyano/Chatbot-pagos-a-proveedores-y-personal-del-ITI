#!/usr/bin/env node

const baseArg = process.argv[2] || process.env.SMOKE_BASE_URL;
const opsKey = process.env.OPS_API_KEY || "";

if (!baseArg) {
  console.error("Uso: node scripts/smoke-prod.js https://app.azurewebsites.net");
  process.exit(2);
}

const base = baseArg.replace(/\/$/, "");

async function check(path, { expected = 200, headers = {}, validate = null } = {}) {
  const url = `${base}${path}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (response.status !== expected) {
    throw new Error(`${path}: HTTP ${response.status}; esperado ${expected}; body=${JSON.stringify(body).slice(0, 500)}`);
  }
  if (validate && !validate(body)) {
    throw new Error(`${path}: respuesta inválida ${JSON.stringify(body).slice(0, 500)}`);
  }
  console.log(`OK ${path}`);
  return body;
}

(async () => {
  await check("/health/live", { validate: (b) => b?.status === "ok" });
  await check("/health/ready", { validate: (b) => b?.status === "ok" && b?.database === "connected" });
  await check("/health/db", { validate: (b) => b?.status === "ok" && b?.database === "connected" });
  await check("/health/schema", { validate: (b) => b?.status === "ok" });
  await check("/health/telegram", { validate: (b) => b?.status === "ok" && b?.webhookConfigured === true });
  await check("/health/automations", { validate: (b) => b?.status === "ok" && Array.isArray(b?.jobs) });
  await check("/health/ai", { validate: (b) => b?.status === "ok" });
  await check("/version", { validate: (b) => b?.status === "ok" && b?.phase === 8 });

  if (opsKey) {
    await check("/ops/summary", {
      headers: { "x-ops-key": opsKey },
      validate: (b) => b?.status === "ok" && typeof b?.pendientesCriticos === "number",
    });
  } else {
    console.log("SKIP /ops/summary (OPS_API_KEY no disponible en el entorno del smoke test)");
  }

  console.log("Smoke test productivo completado correctamente.");
})().catch((error) => {
  console.error(`SMOKE FAILED: ${error.message}`);
  process.exit(1);
});
