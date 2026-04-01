const express = require("express");
const { body, validationResult } = require("express-validator");
const fs = require("fs");
const path = require("path");
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

// Generate report
router.post(
  "/export",
  [
    authMiddleware,
    roleMiddleware("admin", "manager"),
    body("runId").notEmpty(),
    body("format").isIn(["pdf", "excel"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { runId, format } = req.body;

      const predictionRun = await PredictionRun.findOne({ runId });
      if (!predictionRun) {
        return res.status(404).json({ message: "Run not found" });
      }

      const predictions = await PredictionResult.find({
        runId: predictionRun._id,
      });
      const metrics = await ModelMetric.findOne({ runId: predictionRun._id });
      const inventory = await InventorySuggestion.find({
        runId: predictionRun._id,
      });

      // In production, this would generate actual PDF/Excel files
      // For now, we'll return the data that would go into the report

      const reportData = {
        runId: predictionRun.runId,
        modelName: predictionRun.modelName,
        runTime: predictionRun.runTime,
        forecastType: predictionRun.forecastType,
        metrics,
        predictions: predictions.map((p) => ({
          date: p.forecastDate,
          predictedQuantity: p.predictedQuantity,
          predictedCustomers: p.predictedCustomers,
          confidenceInterval: `${p.confidenceLower}-${p.confidenceUpper}`,
        })),
        inventory: inventory.map((i) => ({
          material: i.rawMaterialName,
          suggestedQuantity: i.suggestedQuantity,
          alertLevel: i.alertLevel,
        })),
      };

      // Save report history
      const reportId = generateReportId();
      await ReportHistory.create({
        reportId,
        runId: predictionRun._id,
        format: format.toUpperCase(),
        generatedBy: req.userId,
      });

      logger.info(`Report generated: ${reportId}`);

      res.json({
        message: "Report generated successfully",
        reportId,
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
      })),
    });
  } catch (error) {
    logger.error("Report history error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
