const express = require("express");
const { body, validationResult } = require("express-validator");
const FoodItem = require("../models/FoodItem");
const {
  authMiddleware,
  roleMiddleware,
} = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");

const router = express.Router();

// Get all food items
router.get("/", authMiddleware, async (req, res) => {
  try {
    const foodItems = await FoodItem.find();
    res.json(foodItems);
  } catch (error) {
    logger.error("Get food items error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create food item
router.post(
  "/",
  [
    authMiddleware,
    roleMiddleware("admin"),
    body("mealId").notEmpty().withMessage("Meal ID is required"),
    body("mealName").notEmpty().withMessage("Meal name is required"),
    body("category").notEmpty().withMessage("Category is required"),
    body("unit").notEmpty().withMessage("Unit is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const foodItem = new FoodItem(req.body);
      await foodItem.save();

      logger.info(`Food item created: ${foodItem.mealId}`);
      res.status(201).json(foodItem);
    } catch (error) {
      logger.error("Create food item error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
