const express = require("express");
const { body, validationResult } = require("express-validator");
const PredictionRun = require("../models/PredictionRun");
const PredictionResult = require("../models/PredictionResult");
const ModelMetric = require("../models/ModelMetric");
const SalesRecord = require("../models/SalesRecord");
const {
  authMiddleware,
  roleMiddleware,
} = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");
const { generateRunId } = require("../utils/helpers");
const { runForecast, runRetrain } = require("../services/mlClient");

const router = express.Router();

const MIN_ML_POINTS = 42;

function getModelName(modelType) {
  switch (modelType) {
    case "arima":
      return "ARIMA";
    case "xgboost":
      return "XGBoost";
    case "lstm":
      return "LSTM";
    case "all":
      return "XGBoost";
    default:
      return "XGBoost";
  }
}

async function aggregateDailySales(query) {
  return SalesRecord.aggregate([
    { $match: query },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } },
        quantity: { $sum: "$quantity" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

// Run forecast
router.post(
  "/run",
  [
    authMiddleware,
    roleMiddleware("admin", "manager"),
    body("modelType").isIn(["arima", "xgboost", "lstm", "all"]),
    body("forecastHorizon").isIn(["daily", "weekly"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        modelType,
        forecastHorizon,
        dateRange,
        centerId,
        mealId,
        hyperparameters,
      } = req.body;

      if (!String(process.env.ML_SERVICE_URL || "").trim()) {
        return res.status(503).json({
          message:
            "ML service is not configured. Set ML_SERVICE_URL (e.g. http://127.0.0.1:8000) in Food-demand-forecasting-app-backend/.env and restart the API.",
        });
      }

      let query = {};
      if (centerId) query.centerId = centerId;
      if (mealId) query.mealId = mealId;
      if (dateRange) {
        query.saleDate = {};
        if (dateRange.start) query.saleDate.$gte = new Date(dateRange.start);
        if (dateRange.end) query.saleDate.$lte = new Date(dateRange.end);
      }

      const historicalSales = await aggregateDailySales(query);

      if (historicalSales.length < MIN_ML_POINTS) {
        return res.status(400).json({
          message: `Need at least ${MIN_ML_POINTS} days of sales for ML forecasting. Found ${historicalSales.length}.`,
        });
      }

      const dates = historicalSales.map((d) => d._id);
      const quantities = historicalSales.map((d) => d.quantity);
      const total = historicalSales.length;
      const trainSize = Math.floor(total * 0.8);

      let ml;
      try {
        ml = await runForecast({
          dates,
          quantities,
          modelType,
          forecastHorizon,
        });
      } catch (e) {
        const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
        logger.error("ML forecast failed:", e.message);
        return res.status(status).json({
          message: e.message || "ML forecasting service error",
        });
      }

      const runId = generateRunId();
      const resolvedModelName =
        modelType === "all" && ml.modelName ? ml.modelName : getModelName(modelType);

      const predictionRun = new PredictionRun({
        runId,
        modelName: resolvedModelName,
        requestedModelType: modelType,
        forecastType: forecastHorizon,
        hyperparameters,
        triggeredBy: req.userId,
        status: "completed",
        trainPeriod: {
          start: historicalSales[0]._id,
          end: historicalSales[trainSize - 1]?._id,
        },
        testPeriod:
          trainSize < total
            ? {
                start: historicalSales[trainSize]?._id,
                end: historicalSales[total - 1]._id,
              }
            : undefined,
      });
      await predictionRun.save();

      const defaultCenter = centerId || "C001";
      const defaultMeal = mealId || "M001";

      const predictions = (ml.predictions || []).map((p) => ({
        runId: predictionRun._id,
        forecastDate: new Date(p.date + "T12:00:00.000Z"),
        centerId: defaultCenter,
        mealId: defaultMeal,
        predictedQuantity: p.predictedQuantity,
        predictedCustomers: p.predictedCustomers,
        confidenceLower: p.confidenceLower,
        confidenceUpper: p.confidenceUpper,
      }));
      if (predictions.length === 0) {
        return res.status(502).json({ message: "ML service returned no predictions." });
      }
      await PredictionResult.insertMany(predictions);

      const m = ml.metrics || {};
      const modelMetric = new ModelMetric({
        runId: predictionRun._id,
        mae: m.mae,
        rmse: m.rmse,
        mape: m.mape,
        r2Score: m.r2Score,
        featureImportance: Array.isArray(ml.featureImportance)
          ? ml.featureImportance
          : [],
        modelComparison: Array.isArray(ml.comparison) ? ml.comparison : [],
        holdoutSeries: Array.isArray(ml.holdoutSeries) ? ml.holdoutSeries : [],
      });
      await modelMetric.save();

      logger.info(`Forecast completed: ${runId} (${resolvedModelName})`);

      const responsePayload = {
        runId: predictionRun.runId,
        modelName: resolvedModelName,
        predictions: ml.predictions,
        metrics: {
          mae: m.mae,
          rmse: m.rmse,
          mape: m.mape,
          r2Score: m.r2Score,
        },
      };
      if (Array.isArray(ml.comparison) && ml.comparison.length) {
        responsePayload.comparison = ml.comparison;
      }
      if (Array.isArray(ml.featureImportance) && ml.featureImportance.length) {
        responsePayload.featureImportance = ml.featureImportance;
      }
      if (Array.isArray(ml.holdoutSeries) && ml.holdoutSeries.length) {
        responsePayload.holdoutSeries = ml.holdoutSeries;
      }
      if (modelType === "all") {
        responsePayload.requestedModelType = "all";
        responsePayload.bestModelName = resolvedModelName;
      }

      res.json(responsePayload);
    } catch (error) {
      logger.error("Forecast run error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get forecast results
router.get("/results/:runId", authMiddleware, async (req, res) => {
  try {
    const { runId } = req.params;
    const predictionRun = await PredictionRun.findOne({ runId });
    if (!predictionRun) {
      return res.status(404).json({ message: "Run not found" });
    }

    const predictions = await PredictionResult.find({
      runId: predictionRun._id,
    });
    const metricsDoc = await ModelMetric.findOne({ runId: predictionRun._id });

    const actualData = await SalesRecord.aggregate([
      {
        $match: {
          saleDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } },
          quantity: { $sum: "$quantity" },
          customers: { $sum: "$customerCount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const metrics =
      metricsDoc &&
      ({
        mae: metricsDoc.mae,
        rmse: metricsDoc.rmse,
        mape: metricsDoc.mape,
        r2Score: metricsDoc.r2Score,
      });

    const comparison = metricsDoc?.modelComparison?.length
      ? metricsDoc.modelComparison
      : undefined;

    res.json({
      run: predictionRun,
      predictions: predictions.map((p) => ({
        date: p.forecastDate.toISOString().split("T")[0],
        predictedQuantity: p.predictedQuantity,
        predictedCustomers: p.predictedCustomers,
        confidenceLower: p.confidenceLower,
        confidenceUpper: p.confidenceUpper,
      })),
      metrics,
      featureImportance: metricsDoc?.featureImportance || [],
      comparison,
      holdoutSeries: metricsDoc?.holdoutSeries?.length
        ? metricsDoc.holdoutSeries
        : undefined,
      actualData: actualData.slice(0, 14).map((d) => ({
        date: d._id,
        quantity: d.quantity,
        customers: d.customers,
      })),
    });
  } catch (error) {
    logger.error("Get results error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all forecast runs
router.get("/runs", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const runs = await PredictionRun.find()
      .sort({ runTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("triggeredBy", "name email");

    const total = await PredictionRun.countDocuments();

    const runsWithMetrics = await Promise.all(
      runs.map(async (run) => {
        const metrics = await ModelMetric.findOne({ runId: run._id });
        return {
          ...run.toJSON(),
          metrics,
        };
      })
    );

    res.json({
      runs: runsWithMetrics,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    logger.error("Get runs error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Retrain model
router.post(
  "/retrain",
  [
    authMiddleware,
    roleMiddleware("admin", "manager"),
    body("modelType").isIn(["arima", "xgboost", "lstm"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!String(process.env.ML_SERVICE_URL || "").trim()) {
        return res.status(503).json({
          message:
            "ML service is not configured. Set ML_SERVICE_URL in Food-demand-forecasting-app-backend/.env and restart the API.",
        });
      }

      const { modelType } = req.body;

      const historicalSales = await aggregateDailySales({});
      if (historicalSales.length < MIN_ML_POINTS) {
        return res.status(400).json({
          message: `Need at least ${MIN_ML_POINTS} days of sales for retraining. Found ${historicalSales.length}.`,
        });
      }

      const dates = historicalSales.map((d) => d._id);
      const quantities = historicalSales.map((d) => d.quantity);

      let ml;
      try {
        ml = await runRetrain({
          dates,
          quantities,
          modelType,
        });
      } catch (e) {
        const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
        logger.error("ML retrain failed:", e.message);
        return res.status(status).json({
          message: e.message || "ML retraining service error",
        });
      }

      const runId = generateRunId();
      const predictionRun = new PredictionRun({
        runId,
        modelName: ml.modelName || getModelName(modelType),
        requestedModelType: modelType,
        forecastType: "daily",
        triggeredBy: req.userId,
        status: "completed",
      });
      await predictionRun.save();

      const m = ml.metrics || {};
      await ModelMetric.create({
        runId: predictionRun._id,
        mae: m.mae,
        rmse: m.rmse,
        mape: m.mape,
        r2Score: m.r2Score,
        featureImportance: Array.isArray(ml.featureImportance)
          ? ml.featureImportance
          : [],
        modelComparison: [],
        holdoutSeries: [],
      });

      logger.info(`Model retrained: ${modelType} -> ${runId}`);

      res.json({
        status: "success",
        message: `${modelType} model retrained successfully with latest dataset. New metrics available.`,
        runId: predictionRun.runId,
        metrics: {
          mae: m.mae,
          rmse: m.rmse,
          mape: m.mape,
          r2Score: m.r2Score,
        },
        featureImportance: ml.featureImportance || [],
      });
    } catch (error) {
      logger.error("Retrain error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
