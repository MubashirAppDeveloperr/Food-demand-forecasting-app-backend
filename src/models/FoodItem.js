const mongoose = require("mongoose");

const foodItemSchema = new mongoose.Schema(
  {
    mealId: {
      type: String,
      required: true,
      unique: true,
    },
    mealName: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    unit: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    costPerUnit: Number,
    sellingPrice: Number,
    ingredients: [
      {
        materialName: String,
        quantityPerUnit: Number,
        unit: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FoodItem", foodItemSchema);
