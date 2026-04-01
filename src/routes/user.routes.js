const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const {
  authMiddleware,
  roleMiddleware,
} = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");

const router = express.Router();

// Get all users (Admin only)
router.get("/", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const { page = 1, limit = 10, status, role } = req.query;
    const query = {};

    if (status) query.status = status;
    if (role) query.role = role;

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    logger.error("Get users error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create user (Admin only)
router.post(
  "/",
  [
    authMiddleware,
    roleMiddleware("admin"),
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("role")
      .isIn(["admin", "manager", "staff"])
      .withMessage("Invalid role"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password, role } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const user = new User({ name, email, password, role });
      await user.save();

      logger.info(`User created: ${email}`);
      res.status(201).json({ user: user.toJSON() });
    } catch (error) {
      logger.error("Create user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Update user (Admin only)
router.put(
  "/:id",
  [
    authMiddleware,
    roleMiddleware("admin"),
    body("name").optional().notEmpty(),
    body("email").optional().isEmail(),
    body("role").optional().isIn(["admin", "manager", "staff"]),
    body("status").optional().isIn(["active", "inactive"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const updates = req.body;

      const user = await User.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      logger.info(`User updated: ${user.email}`);
      res.json({ user: user.toJSON() });
    } catch (error) {
      logger.error("Update user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Delete user (Admin only)
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = await User.findByIdAndDelete(id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      logger.info(`User deleted: ${user.email}`);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      logger.error("Delete user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
