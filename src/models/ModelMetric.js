const mongoose = require("mongoose");

const modelMetricSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PredictionRun",
      required: true,
      unique: true,
    },
    mae: Number,
    rmse: Number,
    mape: Number,
    r2Score: Number,
    featureImportance: [
      {
        feature: String,
        importance: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ModelMetric", modelMetricSchema);
