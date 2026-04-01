const mongoose = require("mongoose");

const salesRecordSchema = new mongoose.Schema(
  {
    centerId: {
      type: String,
      required: true,
      ref: "Outlet",
    },
    mealId: {
      type: String,
      required: true,
      ref: "FoodItem",
    },
    saleDate: {
      type: Date,
      required: true,
    },
    saleTime: String,
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    customerCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    sourceType: {
      type: String,
      enum: ["manual", "upload"],
      default: "manual",
    },
    notes: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient querying
salesRecordSchema.index({ centerId: 1, mealId: 1, saleDate: 1 });

module.exports = mongoose.model("SalesRecord", salesRecordSchema);
