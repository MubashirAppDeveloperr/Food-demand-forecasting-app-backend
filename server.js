const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const dataRoutes = require("./src/routes/data.routes");
const preprocessRoutes = require("./src/routes/preprocess.routes");
const forecastRoutes = require("./src/routes/forecast.routes");
const inventoryRoutes = require("./src/routes/inventory.routes");
const reportRoutes = require("./src/routes/report.routes");
const dashboardRoutes = require("./src/routes/dashboard.routes");
const outletRoutes = require("./src/routes/outlet.routes");
const foodItemRoutes = require("./src/routes/foodItem.routes");

const { errorHandler } = require("./src/middleware/error.middleware");
const { logger } = require("./src/utils/logger");

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:8080",
      "http://localhost:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Apply rate limiting to API routes
app.use("/api/", limiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/preprocess", preprocessRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/outlets", outletRoutes);
app.use("/api/food-items", foodItemRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

// Error handling middleware
app.use(errorHandler);

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    logger.info("Connected to MongoDB");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  });

module.exports = app;
