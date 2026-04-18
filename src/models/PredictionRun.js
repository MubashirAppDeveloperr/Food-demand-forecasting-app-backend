const mongoose = require("mongoose");

const predictionRunSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
    },
    modelName: {
      type: String,
      required: true,
      enum: ["ARIMA", "XGBoost", "LSTM"],
    },
    /** Requested in POST /forecast/run (winner stored in modelName when "all") */
    requestedModelType: {
      type: String,
      enum: ["arima", "xgboost", "lstm", "all"],
    },
    runTime: {
      type: Date,
      default: Date.now,
    },
    forecastType: {
      type: String,
      enum: ["daily", "weekly"],
      required: true,
    },
    trainPeriod: {
      start: Date,
      end: Date,
    },
    testPeriod: {
      start: Date,
      end: Date,
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    hyperparameters: mongoose.Schema.Types.Mixed,
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PredictionRun", predictionRunSchema);
