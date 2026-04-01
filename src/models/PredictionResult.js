const mongoose = require("mongoose");

const predictionResultSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PredictionRun",
      required: true,
    },
    forecastDate: {
      type: Date,
      required: true,
    },
    centerId: {
      type: String,
      ref: "Outlet",
      required: true,
    },
    mealId: {
      type: String,
      ref: "FoodItem",
      required: true,
    },
    predictedQuantity: {
      type: Number,
      required: true,
    },
    predictedCustomers: {
      type: Number,
      required: true,
    },
    confidenceLower: Number,
    confidenceUpper: Number,
  },
  {
    timestamps: true,
  }
);

predictionResultSchema.index({
  runId: 1,
  centerId: 1,
  mealId: 1,
  forecastDate: 1,
});

module.exports = mongoose.model("PredictionResult", predictionResultSchema);
