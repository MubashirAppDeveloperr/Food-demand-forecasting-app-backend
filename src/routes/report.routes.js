const express = require("express");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { body, validationResult } = require("express-validator");
const PredictionRun = require("../models/PredictionRun");
const PredictionResult = require("../models/PredictionResult");
const ModelMetric = require("../models/ModelMetric");
const InventorySuggestion = require("../models/InventorySuggestion");
const ReportHistory = require("../models/ReportHistory");
const {
  authMiddleware,
  roleMiddleware,
} = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");
const { generateReportId } = require("../utils/helpers");

const router = express.Router();

const reportsDir = path.join(__dirname, "../../uploads/reports");
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

function ymd(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().split("T")[0];
}

async function buildReportData(predictionRun) {
  const predictions = await PredictionResult.find({
    runId: predictionRun._id,
  }).lean();
  const metrics = await ModelMetric.findOne({ runId: predictionRun._id }).lean();
  const inventory = await InventorySuggestion.find({
    runId: predictionRun._id,
  }).lean();

  const metricsOut = metrics
    ? {
        mae: metrics.mae,
        rmse: metrics.rmse,
        mape: metrics.mape,
        r2Score: metrics.r2Score,
        featureImportance: metrics.featureImportance || [],
        modelComparison: metrics.modelComparison || [],
        holdoutSeries: metrics.holdoutSeries || [],
      }
    : null;

  return {
    runId: predictionRun.runId,
    modelName: predictionRun.modelName,
    runTime: predictionRun.runTime,
    forecastType: predictionRun.forecastType,
    requestedModelType: predictionRun.requestedModelType,
    metrics: metricsOut,
    predictions: predictions.map((p) => ({
      date: ymd(p.forecastDate),
      predictedQuantity: p.predictedQuantity,
      predictedCustomers: p.predictedCustomers,
      confidenceLower: p.confidenceLower,
      confidenceUpper: p.confidenceUpper,
    })),
    inventory: inventory.map((i) => ({
      material: i.rawMaterialName,
      suggestedQuantity: i.suggestedQuantity,
      alertLevel: i.alertLevel,
    })),
  };
}

function appendSheet(wb, rows, name) {
  const safeName = String(name).slice(0, 31) || "Sheet";
  const data =
    Array.isArray(rows) && rows.length > 0 ? rows : [{ note: "No rows" }];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(data), safeName);
}

function buildExcelWorkbook(reportData) {
  const wb = xlsx.utils.book_new();
  const run = reportData;
  const rt =
    run.runTime instanceof Date
      ? run.runTime.toISOString()
      : run.runTime
        ? new Date(run.runTime).toISOString()
        : "";

  const summary = [
    { Field: "runId", Value: run.runId },
    { Field: "modelName", Value: run.modelName },
    { Field: "runTime", Value: rt },
    { Field: "forecastType", Value: run.forecastType },
    { Field: "requestedModelType", Value: run.requestedModelType || "" },
  ];
  if (run.metrics) {
    summary.push(
      { Field: "mae", Value: run.metrics.mae },
      { Field: "rmse", Value: run.metrics.rmse },
      { Field: "mape", Value: run.metrics.mape },
      { Field: "r2Score", Value: run.metrics.r2Score }
    );
  }
  appendSheet(wb, summary, "Summary");

  appendSheet(wb, run.predictions || [], "Predictions");

  const fi = run.metrics?.featureImportance || [];
  if (fi.length) {
    appendSheet(
      wb,
      fi.map((f) => ({ feature: f.feature, importance: f.importance })),
      "FeatureImportance"
    );
  }

  const mc = run.metrics?.modelComparison || [];
  if (mc.length) {
    const rows = mc.map((c) => ({
      modelName: c.modelName,
      error: c.error || "",
      mae: c.metrics?.mae,
      rmse: c.metrics?.rmse,
      mape: c.metrics?.mape,
      r2Score: c.metrics?.r2Score,
    }));
    appendSheet(wb, rows, "ModelComparison");
  }

  const ho = run.metrics?.holdoutSeries || [];
  if (ho.length) {
    appendSheet(wb, ho, "Holdout");
  }

  appendSheet(wb, run.inventory || [], "Inventory");

  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

// Generate Excel report only
router.post(
  "/export",
  [
    authMiddleware,
    roleMiddleware("admin", "manager"),
    body("runId").notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { runId } = req.body;

      const predictionRun = await PredictionRun.findOne({ runId });
      if (!predictionRun) {
        return res.status(404).json({ message: "Run not found" });
      }

      const reportData = await buildReportData(predictionRun);
      const reportId = generateReportId();
      const fileName = `${reportId}.xlsx`;
      const filePath = path.join(reportsDir, fileName);

      const buffer = buildExcelWorkbook(reportData);
      fs.writeFileSync(filePath, buffer);

      await ReportHistory.create({
        reportId,
        runId: predictionRun._id,
        format: "Excel",
        filePath,
        generatedBy: req.userId,
      });

      logger.info(`Excel report generated: ${reportId} -> ${filePath}`);

      res.json({
        message: "Excel report generated successfully",
        reportId,
        fileName,
        data: reportData,
      });
    } catch (error) {
      logger.error("Export error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get report history
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const reports = await ReportHistory.find()
      .sort({ generatedAt: -1 })
      .populate("runId", "modelName runTime")
      .populate("generatedBy", "name");

    res.json({
      reports: reports.map((r) => ({
        id: r.reportId,
        runId: r.runId?.runId || r.runId?._id,
        format: r.format,
        generatedBy: r.generatedBy?.name,
        generatedAt: r.generatedAt,
        excelAvailable: Boolean(
          r.filePath && typeof r.filePath === "string" && fs.existsSync(r.filePath)
        ),
      })),
    });
  } catch (error) {
    logger.error("Report history error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Download Excel file (must be before GET /:reportId)
router.get(
  "/:reportId/download",
  authMiddleware,
  roleMiddleware("admin", "manager"),
  async (req, res) => {
    try {
      const hist = await ReportHistory.findOne({ reportId: req.params.reportId });
      if (!hist || !hist.filePath || !fs.existsSync(hist.filePath)) {
        return res
          .status(404)
          .json({ message: "Excel file not found for this report" });
      }
      const downloadName = path.basename(hist.filePath);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${downloadName}"`
      );
      res.sendFile(path.resolve(hist.filePath), (err) => {
        if (err && !res.headersSent) {
          logger.error("Report download sendFile error:", err);
          res.status(500).json({ message: "Download failed" });
        }
      });
    } catch (error) {
      logger.error("Download error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// View saved report (JSON)
router.get(
  "/:reportId",
  authMiddleware,
  roleMiddleware("admin", "manager"),
  async (req, res) => {
    try {
      const hist = await ReportHistory.findOne({ reportId: req.params.reportId });
      if (!hist) {
        return res.status(404).json({ message: "Report not found" });
      }
      const predictionRun = await PredictionRun.findById(hist.runId);
      if (!predictionRun) {
        return res.status(404).json({ message: "Forecast run no longer exists" });
      }
      const data = await buildReportData(predictionRun);
      res.json({
        reportId: hist.reportId,
        format: hist.format,
        generatedAt: hist.generatedAt,
        excelAvailable: Boolean(
          hist.filePath &&
            typeof hist.filePath === "string" &&
            fs.existsSync(hist.filePath)
        ),
        data,
      });
    } catch (error) {
      logger.error("Get report error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
