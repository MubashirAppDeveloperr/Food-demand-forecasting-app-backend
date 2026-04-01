const express = require("express");
const SalesRecord = require("../models/SalesRecord");
const PredictionRun = require("../models/PredictionRun");
const ModelMetric = require("../models/ModelMetric");
const InventorySuggestion = require("../models/InventorySuggestion");
const { authMiddleware } = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");

const router = express.Router();

// Dashboard summary
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's sales
    const todaySales = await SalesRecord.aggregate([
      { $match: { saleDate: { $gte: today, $lt: tomorrow } } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$quantity" },
          totalCustomers: { $sum: "$customerCount" },
        },
      },
    ]);

    const todayTotal = todaySales[0] || { totalQuantity: 0, totalCustomers: 0 };

    // Get last week's sales for comparison
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekSales = await SalesRecord.aggregate([
      { $match: { saleDate: { $gte: lastWeekStart, $lt: today } } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$quantity" },
          totalCustomers: { $sum: "$customerCount" },
        },
      },
    ]);

    const lastWeekTotal = lastWeekSales[0] || {
      totalQuantity: 0,
      totalCustomers: 0,
    };

    const quantityChange =
      lastWeekTotal.totalQuantity > 0
        ? (
            ((todayTotal.totalQuantity - lastWeekTotal.totalQuantity) /
              lastWeekTotal.totalQuantity) *
            100
          ).toFixed(1)
        : 0;

    const customerChange =
      lastWeekTotal.totalCustomers > 0
        ? (
            ((todayTotal.totalCustomers - lastWeekTotal.totalCustomers) /
              lastWeekTotal.totalCustomers) *
            100
          ).toFixed(1)
        : 0;

    // Get latest prediction
    const latestRun = await PredictionRun.findOne({ status: "completed" }).sort(
      { runTime: -1 }
    );
    let predictedDemand = null;

    if (latestRun) {
      const metrics = await ModelMetric.findOne({ runId: latestRun._id });
      predictedDemand = {
        model: latestRun.modelName,
        mape: metrics?.mape || null,
      };
    }

    // Get active alerts
    const activeAlerts = await InventorySuggestion.find({
      alertLevel: { $ne: "normal" },
    });

    // Get recent sales trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesTrend = await SalesRecord.aggregate([
      { $match: { saleDate: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } },
          totalOrders: { $sum: "$quantity" },
          totalCustomers: { $sum: "$customerCount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      kpis: {
        totalCustomersToday: todayTotal.totalCustomers,
        totalOrdersToday: todayTotal.totalQuantity,
        predictedDemandTomorrow: Math.floor(todayTotal.totalQuantity * 1.15), // Simple prediction
        activeAlertsCount: activeAlerts.length,
        customerChange: parseFloat(customerChange),
        orderChange: parseFloat(quantityChange),
      },
      latestPrediction: predictedDemand,
      salesTrend: salesTrend.map((item) => ({
        date: item._id,
        totalOrders: item.totalOrders,
        totalCustomers: item.totalCustomers,
      })),
      recentRuns: await PredictionRun.find({ status: "completed" })
        .sort({ runTime: -1 })
        .limit(5)
        .populate("triggeredBy", "name"),
      alerts: activeAlerts.slice(0, 5).map((alert) => ({
        id: alert._id,
        message:
          alert.alertMessage ||
          `${alert.rawMaterialName} - ${alert.alertLevel} level`,
        level: alert.alertLevel,
        time: alert.createdAt,
      })),
    });
  } catch (error) {
    logger.error("Dashboard summary error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
