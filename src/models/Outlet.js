const mongoose = require("mongoose");

const outletSchema = new mongoose.Schema(
  {
    centerId: {
      type: String,
      required: true,
      unique: true,
    },
    centerName: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["Dine-in", "Fast Food", "Cafe", "Food Court"],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    address: String,
    phone: String,
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Outlet", outletSchema);
