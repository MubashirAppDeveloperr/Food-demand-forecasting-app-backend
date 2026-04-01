const mongoose = require("mongoose");

const inventorySuggestionSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PredictionRun",
      required: true,
    },
    rawMaterialName: {
      type: String,
      required: true,
    },
    suggestedQuantity: {
      type: Number,
      required: true,
    },
    alertLevel: {
      type: String,
      enum: ["normal", "warning", "critical"],
      default: "normal",
    },
    alertMessage: String,
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "InventorySuggestion",
  inventorySuggestionSchema
);
