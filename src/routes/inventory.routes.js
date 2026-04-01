const express = require("express");
const InventorySuggestion = require("../models/InventorySuggestion");
const PredictionResult = require("../models/PredictionResult");
const PredictionRun = require("../models/PredictionRun");
const FoodItem = require("../models/FoodItem");
const {
  authMiddleware,
  roleMiddleware,
} = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");

const router = express.Router();

// Generate inventory plan
router.post(
  "/generate-plan",
  [authMiddleware, roleMiddleware("admin", "manager")],
  async (req, res) => {
    try {
      const { runId } = req.body;
      let predictionRun;
      if (runId) {
        predictionRun = await PredictionRun.findOne({ runId });
      } else {
        predictionRun = await PredictionRun.findOne({
          status: "completed",
        }).sort({ runTime: -1 });
      }
      if (!predictionRun) {
        return res.status(404).json({ message: "No prediction run found" });
      }

      const predictions = await PredictionResult.find({
        runId: predictionRun._id,
      });
      const foodItems = await FoodItem.find({ active: true });

      const materialRequirements = {};
      for (const prediction of predictions) {
        const foodItem = foodItems.find((f) => f.mealId === prediction.mealId);
        if (foodItem && foodItem.ingredients) {
          for (const ingredient of foodItem.ingredients) {
            const requiredQty =
              prediction.predictedQuantity * ingredient.quantityPerUnit;
            if (!materialRequirements[ingredient.materialName]) {
              materialRequirements[ingredient.materialName] = 0;
            }
            materialRequirements[ingredient.materialName] += requiredQty;
          }
        }
      }

      const suggestions = [];
      for (const [material, quantity] of Object.entries(materialRequirements)) {
        let alertLevel = "normal";
        let alertMessage = "";
        if (quantity > 100) {
          alertLevel = "critical";
          alertMessage = `${material} demand is significantly above average`;
        } else if (quantity > 50) {
          alertLevel = "warning";
          alertMessage = `${material} demand is above average`;
        }
        suggestions.push({
          runId: predictionRun._id,
          rawMaterialName: material,
          suggestedQuantity: Math.ceil(quantity),
          alertLevel,
          alertMessage,
        });
      }

      await InventorySuggestion.deleteMany({ runId: predictionRun._id });
      await InventorySuggestion.insertMany(suggestions);

      res.json({
        message: "Inventory plan generated successfully",
        suggestions: suggestions.map((s) => ({
          materialName: s.rawMaterialName,
          suggestedQty: s.suggestedQuantity,
          alertLevel: s.alertLevel,
          alertMessage: s.alertMessage,
        })),
      });
    } catch (error) {
      logger.error("Generate plan error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get inventory suggestions for latest run
router.get("/suggestions", authMiddleware, async (req, res) => {
  try {
    const latestRun = await PredictionRun.findOne({ status: "completed" }).sort(
      { runTime: -1 }
    );
    if (!latestRun) {
      return res.json({ suggestions: [] });
    }
    const suggestions = await InventorySuggestion.find({
      runId: latestRun._id,
    });
    res.json({
      suggestions: suggestions.map((s) => ({
        id: s._id,
        materialName: s.rawMaterialName,
        suggestedQty: s.suggestedQuantity,
        alertLevel: s.alertLevel,
        alertMessage: s.alertMessage,
      })),
    });
  } catch (error) {
    logger.error("Get suggestions error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get inventory plan for a specific run
router.get(
  "/plan/:runId",
  authMiddleware,
  roleMiddleware("admin", "manager"),
  async (req, res) => {
    try {
      const { runId } = req.params;
      const run = await PredictionRun.findOne({ runId });
      if (!run) {
        return res.status(404).json({ message: "Run not found" });
      }
      const suggestions = await InventorySuggestion.find({ runId: run._id });
      res.json({
        runId: run.runId,
        modelName: run.modelName,
        suggestions: suggestions.map((s) => ({
          materialName: s.rawMaterialName,
          suggestedQty: s.suggestedQuantity,
          alertLevel: s.alertLevel,
          alertMessage: s.alertMessage,
        })),
      });
    } catch (error) {
      logger.error("Get inventory plan error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
