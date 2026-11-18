const config = require("../config/env");

function enabled() {
  const cfg = config.ai.openai;
  return Boolean(cfg.enabled && cfg.endpoint && cfg.apiKey && cfg.model);
}

function baseUrl() {
  let endpoint = String(config.ai.openai.endpoint || "").replace(/\/+$/, "");
  if (!/\/openai\/v1$/i.test(endpoint)) endpoint += "/openai/v1";
  return endpoint;
}

function outputText(body) {
  if (typeof body?.output_text === "string") return body.output_text;
  for (const item of body?.output || []) {
    for (const part of item?.content || []) {
      if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

async function structuredResponse({ system, user, schema, name, maxOutputTokens = 1200 }) {
  if (!enabled()) throw new Error("Azure OpenAI no está habilitado/configurado.");
  const cfg = config.ai.openai;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
  try {
    const response = await fetch(`${baseUrl()}/responses`, {
      method: "POST",
      headers: {
        "api-key": cfg.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        store: false,
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: user }] },
        ],
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema,
          },
        },
        max_output_tokens: maxOutputTokens,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Azure OpenAI respondió HTTP ${response.status}: ${JSON.stringify(body).slice(0, 700)}`);
    }
    const text = outputText(body);
    if (!text) throw new Error("Azure OpenAI no devolvió output_text.");
    return { data: JSON.parse(text), responseId: body.id || null, model: cfg.model };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { enabled, structuredResponse };
