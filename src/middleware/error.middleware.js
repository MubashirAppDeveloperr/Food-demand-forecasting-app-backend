const { logger } = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: "Validation error", errors });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({ message: "Duplicate field value entered" });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ message: "Invalid token" });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Token expired" });
  }

  const status = err.status || 500;
  const message = err.message || "Server Error";

  res.status(status).json({ message });
};

module.exports = { errorHandler };
