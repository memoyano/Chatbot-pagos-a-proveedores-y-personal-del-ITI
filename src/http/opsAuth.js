const crypto = require("crypto");

function extraerOpsKey(req) {
  const direct = req?.get?.("x-ops-key") || req?.headers?.["x-ops-key"];
  if (direct) return String(direct);
  const auth = req?.get?.("authorization") || req?.headers?.authorization;
  if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return "";
}

function equalsSeguro(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (!aa.length || aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function createOpsAuth(apiKey) {
  return (req, res, next) => {
    if (!apiKey) {
      return res.status(503).json({ status: "error", code: "OPS_API_DISABLED", requestId: req.requestId });
    }
    if (!equalsSeguro(extraerOpsKey(req), apiKey)) {
      return res.status(401).json({ status: "error", code: "UNAUTHORIZED", requestId: req.requestId });
    }
    return next();
  };
}

module.exports = { extraerOpsKey, equalsSeguro, createOpsAuth };
