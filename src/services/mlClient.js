const { logger } = require("../utils/logger");

const DEFAULT_TIMEOUT_MS = 120000;

/**
 * @param {string} path - e.g. "/forecast" or "/retrain"
 * @param {object} body
 * @returns {Promise<object>}
 */
async function postMl(path, body) {
  const base = String(process.env.ML_SERVICE_URL || "").trim();
  if (!base) {
    throw new Error("ML_SERVICE_URL is not configured");
  }
  const url = `${base.replace(/\/$/, "")}${path}`;
  const headers = {
    "Content-Type": "application/json",
  };
  const secret = process.env.ML_SERVICE_SECRET;
  if (secret) {
    headers["X-ML-Service-Token"] = secret;
  }

  const controller = new AbortController();
  const timeout = Number(process.env.ML_SERVICE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const t = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text || "Invalid JSON from ML service" };
    }
    if (!res.ok) {
      let detail = data.detail;
      if (Array.isArray(detail)) {
        detail = detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
      }
      const msg =
        detail ||
        data.message ||
        (Array.isArray(data.errors) && data.errors[0]?.msg) ||
        `ML service error ${res.status}`;
      const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      logger.error("ML service request timed out", { url, timeout });
      const err = new Error("ML service request timed out");
      err.status = 504;
      throw err;
    }
    if (e.status) throw e;
    logger.error("ML service request failed", { url, error: e.message });
    const err = new Error(`ML service unreachable: ${e.message}`);
    err.status = 502;
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function runForecast(payload) {
  return postMl("/forecast", payload);
}

async function runRetrain(payload) {
  return postMl("/retrain", payload);
}

module.exports = { postMl, runForecast, runRetrain, DEFAULT_TIMEOUT_MS };
