const mongoose = require("mongoose");

const reportHistorySchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
    },
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PredictionRun",
    },
    format: {
      type: String,
      enum: ["PDF", "Excel"],
      required: true,
    },
    filePath: String,
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ReportHistory", reportHistorySchema);
