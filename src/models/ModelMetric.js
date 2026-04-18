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
    /** When modelType was "all": per-model test metrics from ML service */
    modelComparison: [mongoose.Schema.Types.Mixed],
    /** Holdout evaluation points for actual vs predicted chart (winner model) */
    holdoutSeries: [
      {
        date: String,
        actual: Number,
        predicted: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ModelMetric", modelMetricSchema);
