const mongoose = require("mongoose");

const preprocessingLogSchema = new mongoose.Schema({
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ImportBatch",
  },
  duplicatesRemoved: {
    type: Number,
    default: 0,
  },
  missingValuesFixed: {
    type: Number,
    default: 0,
  },
  outliersFlagged: {
    type: Number,
    default: 0,
  },
  totalRecordsProcessed: {
    type: Number,
    default: 0,
  },
  featuresGenerated: [String],
  notes: String,
  processedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("PreprocessingLog", preprocessingLogSchema);
