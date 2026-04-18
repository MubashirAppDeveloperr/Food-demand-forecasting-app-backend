const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("../models/User");
const Outlet = require("../models/Outlet");
const FoodItem = require("../models/FoodItem");
const SalesRecord = require("../models/SalesRecord");

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for seeding");
    console.warn(
      "WARNING: This script DELETES all users, outlets, food items, and sales, then recreates samples. Do not run on a DB where you have CSV imports you want to keep."
    );

    // Clear existing data (optional - comment out if you want to keep existing)
    await User.deleteMany({});
    await Outlet.deleteMany({});
    await FoodItem.deleteMany({});
    await SalesRecord.deleteMany({});
    console.log("Cleared existing data");

    // Create users
    const admin = await User.create({
      name: "Admin User",
      email: "admin@restaurant.com",
      password: "admin123",
      role: "admin",
      status: "active",
    });

    const manager = await User.create({
      name: "Manager User",
      email: "manager@restaurant.com",
      password: "manager123",
      role: "manager",
      status: "active",
    });

    const staff = await User.create({
      name: "Staff User",
      email: "staff@restaurant.com",
      password: "staff123",
      role: "staff",
      status: "active",
    });
    console.log("Users created");

    // Create outlets
    const outlet1 = await Outlet.create({
      centerId: "C001",
      centerName: "Downtown Branch",
      city: "Lahore",
      type: "Dine-in",
      status: "active",
      address: "123 Main Street, Lahore",
    });

    const outlet2 = await Outlet.create({
      centerId: "C002",
      centerName: "Mall Food Court",
      city: "Karachi",
      type: "Fast Food",
      status: "active",
      address: "City Mall, Karachi",
    });

    const outlet3 = await Outlet.create({
      centerId: "C003",
      centerName: "University Cafe",
      city: "Islamabad",
      type: "Cafe",
      status: "active",
      address: "University Road, Islamabad",
    });
    console.log("Outlets created");

    // Create food items with ingredients for inventory
    const food1 = await FoodItem.create({
      mealId: "M001",
      mealName: "Chicken Biryani",
      category: "Rice",
      unit: "plate",
      active: true,
      costPerUnit: 250,
      sellingPrice: 350,
      ingredients: [
        { materialName: "Basmati Rice", quantityPerUnit: 0.3, unit: "kg" },
        { materialName: "Chicken Breast", quantityPerUnit: 0.2, unit: "kg" },
        { materialName: "Yogurt", quantityPerUnit: 0.1, unit: "kg" },
        { materialName: "Spices Mix", quantityPerUnit: 0.05, unit: "kg" },
      ],
    });

    const food2 = await FoodItem.create({
      mealId: "M002",
      mealName: "Beef Burger",
      category: "Fast Food",
      unit: "piece",
      active: true,
      costPerUnit: 180,
      sellingPrice: 250,
      ingredients: [
        { materialName: "Burger Bun", quantityPerUnit: 1, unit: "piece" },
        { materialName: "Beef Patty", quantityPerUnit: 0.15, unit: "kg" },
        { materialName: "Lettuce", quantityPerUnit: 0.03, unit: "kg" },
        { materialName: "Cheese Slice", quantityPerUnit: 1, unit: "slice" },
      ],
    });

    const food3 = await FoodItem.create({
      mealId: "M003",
      mealName: "Caesar Salad",
      category: "Salad",
      unit: "bowl",
      active: true,
      costPerUnit: 120,
      sellingPrice: 180,
      ingredients: [
        { materialName: "Lettuce", quantityPerUnit: 0.15, unit: "kg" },
        { materialName: "Chicken Breast", quantityPerUnit: 0.1, unit: "kg" },
        { materialName: "Croutons", quantityPerUnit: 0.05, unit: "kg" },
        {
          materialName: "Caesar Dressing",
          quantityPerUnit: 0.05,
          unit: "litre",
        },
      ],
    });

    const food4 = await FoodItem.create({
      mealId: "M004",
      mealName: "Margherita Pizza",
      category: "Pizza",
      unit: "piece",
      active: true,
      costPerUnit: 300,
      sellingPrice: 450,
      ingredients: [
        { materialName: "Pizza Dough", quantityPerUnit: 0.25, unit: "kg" },
        { materialName: "Tomato Sauce", quantityPerUnit: 0.1, unit: "kg" },
        {
          materialName: "Mozzarella Cheese",
          quantityPerUnit: 0.15,
          unit: "kg",
        },
        { materialName: "Basil", quantityPerUnit: 0.01, unit: "kg" },
      ],
    });
    console.log("Food items created");

    // Create sample sales records (last 30 days)
    const salesRecords = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    for (let i = 0; i < 90; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      // Random quantity between 10 and 50
      const quantity = Math.floor(Math.random() * 40) + 10;
      const customers =
        Math.floor(quantity * 0.8) + Math.floor(Math.random() * 10);

      salesRecords.push({
        centerId: i % 2 === 0 ? "C001" : i % 3 === 0 ? "C003" : "C002",
        mealId: `M00${(i % 4) + 1}`,
        saleDate: date,
        saleTime: `${12 + (i % 8)}:00`,
        quantity: quantity,
        customerCount: customers,
        sourceType: "manual",
        createdBy: admin._id,
      });
    }

    await SalesRecord.insertMany(salesRecords);
    console.log(`Created ${salesRecords.length} sales records`);

    console.log("\n✅ Seeding complete!");
    console.log("\nTest Logins:");
    console.log("  Admin:    admin@restaurant.com / admin123");
    console.log("  Manager:  manager@restaurant.com / manager123");
    console.log("  Staff:    staff@restaurant.com / staff123");

    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
};

seed();
