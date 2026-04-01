const crypto = require("crypto");

const generateBatchId = () => {
  return `BATCH_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
};

const generateRunId = () => {
  return `RUN_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
};

const generateReportId = () => {
  return `RPT_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
};

const calculateMetrics = () => {
  // In production, these would be calculated from actual predictions vs actuals
  return {
    mae: +(8 + Math.random() * 6).toFixed(1),
    rmse: +(10 + Math.random() * 8).toFixed(1),
    mape: +(4 + Math.random() * 6).toFixed(1),
    r2Score: +(0.85 + Math.random() * 0.1).toFixed(2),
  };
};

module.exports = {
  generateBatchId,
  generateRunId,
  generateReportId,
  calculateMetrics,
};
