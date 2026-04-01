const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");

const router = express.Router();

// Login
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      const user = await User.findOne({ email });

      if (!user || !(await user.comparePassword(password))) {
        logger.warn(
          `Failed login attempt for email: ${email} from IP: ${req.ip}`
        );
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.status !== "active") {
        logger.warn(`Login attempt for inactive account: ${email}`);
        return res.status(401).json({ message: "Account is deactivated" });
      }

      user.lastLogin = new Date();
      await user.save();

      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
      );

      const refreshToken = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      user.refreshToken = refreshToken;
      await user.save();

      logger.info(`User logged in: ${user.email}`);

      res.json({
        user: user.toJSON(),
        token,
        refreshToken,
      });
    } catch (error) {
      logger.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Logout
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    user.refreshToken = null;
    await user.save();
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Refresh token
router.post("/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.json({ token });
  } catch (error) {
    logger.error("Refresh token error:", error);
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

// Get current user
router.get("/me", authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
