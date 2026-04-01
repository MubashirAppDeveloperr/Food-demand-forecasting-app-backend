const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const { body, validationResult } = require("express-validator");
const SalesRecord = require("../models/SalesRecord");
const ImportBatch = require("../models/ImportBatch");
const PreprocessingLog = require("../models/PreprocessingLog");
const Outlet = require("../models/Outlet");
const FoodItem = require("../models/FoodItem");
const {
  authMiddleware,
  roleMiddleware,
} = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");
const { logger } = require("../utils/logger");
const { generateBatchId } = require("../utils/helpers");

const router = express.Router();

// Create uploads directory if not exists
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Upload file
router.post(
  "/upload",
  [authMiddleware, roleMiddleware("admin", "manager"), upload.single("file")],
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const batchId = generateBatchId();
      const importBatch = new ImportBatch({
        batchId,
        fileName: req.file.originalname,
        filePath: req.file.path,
        uploadedBy: req.userId,
        status: "pending",
      });

      await importBatch.save();

      res.json({
        message: "File uploaded successfully",
        batchId,
        fileName: req.file.originalname,
      });
    } catch (error) {
      logger.error("Upload error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

// Preview uploaded file
router.post(
  "/preview/:batchId",
  authMiddleware,
  roleMiddleware("admin", "manager"),
  async (req, res) => {
    try {
      const { batchId } = req.params;
      const importBatch = await ImportBatch.findOne({ batchId });
      if (!importBatch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      // Read file and parse
      const filePath = importBatch.filePath;
      const fileExt = path.extname(filePath).toLowerCase();
      let data = [];

      if (fileExt === ".csv") {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const rows = fileContent.split("\n");
        const headers = rows[0].split(",");
        for (let i = 1; i < Math.min(rows.length, 101); i++) {
          const values = rows[i].split(",");
          const row = {};
          headers.forEach((header, idx) => {
            row[header.trim()] = values[idx]?.trim();
          });
          if (Object.keys(row).length > 0) data.push(row);
        }
      } else {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = xlsx.utils.sheet_to_json(worksheet).slice(0, 100);
      }

      // Validate each row and collect issues
      const previewRows = [];
      const validationIssues = [];

      for (const row of data) {
        const issues = [];
        if (
          !row.centerId &&
          !row.center_id &&
          !row.outletId &&
          !row.outlet_id
        ) {
          issues.push("Missing center identifier");
        }
        if (
          !row.mealId &&
          !row.meal_id &&
          !row.foodItemId &&
          !row.food_item_id
        ) {
          issues.push("Missing meal identifier");
        }
        if (!row.quantity && row.quantity !== 0) {
          issues.push("Missing quantity");
        }
        if (!row.saleDate && !row.date) {
          issues.push("Missing sale date");
        }
        if (row.quantity && isNaN(parseFloat(row.quantity))) {
          issues.push("Quantity must be a number");
        }
        if (row.customerCount && isNaN(parseFloat(row.customerCount))) {
          issues.push("Customer count must be a number");
        }

        previewRows.push({
          row,
          issues: issues.length ? issues : null,
        });
        if (issues.length) validationIssues.push({ row, issues });
      }

      res.json({
        batchId,
        totalRows: data.length,
        previewRows: previewRows.slice(0, 20),
        validationIssues: validationIssues.slice(0, 20),
        issueCount: validationIssues.length,
      });
    } catch (error) {
      logger.error("Preview error:", error);
      res.status(500).json({ message: "Preview failed" });
    }
  }
);

// Process uploaded file (import data)
router.post(
  "/process/:batchId",
  authMiddleware,
  roleMiddleware("admin", "manager"),
  async (req, res) => {
    try {
      const { batchId } = req.params;
      const importBatch = await ImportBatch.findOne({ batchId });

      if (!importBatch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      importBatch.status = "processing";
      await importBatch.save();

      // Read and parse file
      const filePath = importBatch.filePath;
      const fileExt = path.extname(filePath).toLowerCase();
      let data = [];

      if (fileExt === ".csv") {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const rows = fileContent.split("\n");
        const headers = rows[0].split(",");
        for (let i = 1; i < rows.length; i++) {
          const values = rows[i].split(",");
          const row = {};
          headers.forEach((header, idx) => {
            row[header.trim()] = values[idx]?.trim();
          });
          if (Object.keys(row).length > 0) data.push(row);
        }
      } else {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = xlsx.utils.sheet_to_json(worksheet);
      }

      // Validate and import data
      const validRecords = [];
      const errors = [];
      const warnings = [];

      for (const row of data) {
        try {
          const centerId =
            row.centerId || row.center_id || row.outletId || row.outlet_id;
          const mealId =
            row.mealId || row.meal_id || row.foodItemId || row.food_item_id;
          const quantity = parseFloat(row.quantity);
          const customerCount = parseFloat(
            row.customerCount || row.customer_count || row.customers || 0
          );
          const saleDate = new Date(row.saleDate || row.date);

          // Verify outlet and food item exist
          const outlet = await Outlet.findOne({ centerId });
          if (!outlet) {
            warnings.push(`Outlet ${centerId} not found, skipping record`);
            continue;
          }

          const foodItem = await FoodItem.findOne({ mealId });
          if (!foodItem) {
            warnings.push(`Food item ${mealId} not found, skipping record`);
            continue;
          }

          validRecords.push({
            centerId,
            mealId,
            saleDate,
            saleTime: row.saleTime || row.sale_time || row.time,
            quantity,
            customerCount: isNaN(customerCount) ? 0 : customerCount,
            sourceType: "upload",
          });
        } catch (err) {
          errors.push({ row, error: err.message });
        }
      }

      // Insert valid records
      let successfulRecords = 0;
      for (const record of validRecords) {
        try {
          await SalesRecord.create(record);
          successfulRecords++;
        } catch (err) {
          errors.push({ record, error: err.message });
        }
      }

      importBatch.totalRecords = data.length;
      importBatch.successfulRecords = successfulRecords;
      importBatch.failedRecords = errors.length;
      importBatch.status = "completed";
      importBatch.warnings = warnings;
      if (errors.length > 0) {
        importBatch.errorSummary = `${errors.length} records failed validation`;
      }
      await importBatch.save();

      res.json({
        message: "File processed successfully",
        totalRecords: data.length,
        successfulRecords,
        failedRecords: errors.length,
        warnings,
        errors: errors.slice(0, 10),
      });
    } catch (error) {
      logger.error("Process error:", error);
      const importBatch = await ImportBatch.findOne({
        batchId: req.params.batchId,
      });
      if (importBatch) {
        importBatch.status = "failed";
        importBatch.errorSummary = error.message;
        await importBatch.save();
      }
      res.status(500).json({ message: "Processing failed" });
    }
  }
);

// Manual data entry
router.post(
  "/manual-entry",
  [
    authMiddleware,
    roleMiddleware("admin", "manager", "staff"),
    body("centerId").notEmpty(),
    body("mealId").notEmpty(),
    body("saleDate").isISO8601(),
    body("quantity").isFloat({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        centerId,
        mealId,
        saleDate,
        saleTime,
        quantity,
        customerCount,
        notes,
      } = req.body;

      const outlet = await Outlet.findOne({ centerId });
      if (!outlet) {
        return res.status(404).json({ message: "Outlet not found" });
      }

      const foodItem = await FoodItem.findOne({ mealId });
      if (!foodItem) {
        return res.status(404).json({ message: "Food item not found" });
      }

      const salesRecord = new SalesRecord({
        centerId,
        mealId,
        saleDate: new Date(saleDate),
        saleTime,
        quantity,
        customerCount: customerCount || 0,
        sourceType: "manual",
        notes,
        createdBy: req.userId,
      });

      await salesRecord.save();

      res.status(201).json({
        message: "Sales record saved successfully",
        record: salesRecord,
      });
    } catch (error) {
      logger.error("Manual entry error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get preprocessing result for a batch
router.get(
  "/preprocessing/:batchId",
  authMiddleware,
  roleMiddleware("admin", "manager"),
  async (req, res) => {
    try {
      const { batchId } = req.params;
      const importBatch = await ImportBatch.findOne({ batchId });

      if (!importBatch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      const preprocessingLog = await PreprocessingLog.findOne({
        batchId: importBatch._id,
      });

      if (!preprocessingLog) {
        return res.json({
          duplicatesRemoved: 0,
          missingValuesFixed: 0,
          outliersFlagged: 0,
          totalRecordsProcessed: importBatch.totalRecords || 0,
          featuresGenerated: [],
        });
      }

      res.json(preprocessingLog);
    } catch (error) {
      logger.error("Get preprocessing error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
