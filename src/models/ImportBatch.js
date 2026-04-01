const mongoose = require("mongoose");

const importBatchSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      required: true,
      unique: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    filePath: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    uploadTime: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["pending", "validating", "processing", "completed", "failed"],
      default: "pending",
    },
    totalRecords: Number,
    successfulRecords: Number,
    failedRecords: Number,
    errorSummary: String,
    warnings: [String],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ImportBatch", importBatchSchema);
