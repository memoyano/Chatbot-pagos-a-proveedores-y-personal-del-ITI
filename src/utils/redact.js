const SENSITIVE_KEYS = /pass(word)?|token|secret|otp|authorization|cookie|connectionstring/i;

function sanitize(value, depth = 0) {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.test(key) ? "[REDACTED]" : sanitize(val, depth + 1);
  }
  return out;
}

module.exports = { sanitize, SENSITIVE_KEYS };
