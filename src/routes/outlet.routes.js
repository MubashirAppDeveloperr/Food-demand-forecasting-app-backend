const express = require("express");
const { body, validationResult } = require("express-validator");
const Outlet = require("../models/Outlet");
const {
  authMiddleware,
  roleMiddleware,
} = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");

const router = express.Router();

// Get all outlets
router.get("/", authMiddleware, async (req, res) => {
  try {
    const outlets = await Outlet.find().populate("manager", "name email");
    res.json(outlets);
  } catch (error) {
    logger.error("Get outlets error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create outlet
router.post(
  "/",
  [
    authMiddleware,
    roleMiddleware("admin"),
    body("centerId").notEmpty().withMessage("Center ID is required"),
    body("centerName").notEmpty().withMessage("Center name is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("type")
      .isIn(["Dine-in", "Fast Food", "Cafe", "Food Court"])
      .withMessage("Invalid outlet type"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const outlet = new Outlet(req.body);
      await outlet.save();

      logger.info(`Outlet created: ${outlet.centerId}`);
      res.status(201).json(outlet);
    } catch (error) {
      logger.error("Create outlet error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
