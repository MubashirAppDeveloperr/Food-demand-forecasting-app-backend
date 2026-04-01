const express = require("express");
const SalesRecord = require("../models/SalesRecord");
const ImportBatch = require("../models/ImportBatch");
const PreprocessingLog = require("../models/PreprocessingLog");
const {
  authMiddleware,
  roleMiddleware,
} = require("../middleware/auth.middleware");
const { logger } = require("../utils/logger");
const { generateFeatures } = require("../utils/featureEngineering");
const { aggregateSalesData } = require("../utils/aggregation");

const router = express.Router();

// Run preprocessing on a batch or on all data
router.post(
  "/run",
  authMiddleware,
  roleMiddleware("admin", "manager"),
  async (req, res) => {
    try {
      const { batchId, dateRange } = req.body;

      let query = {};
      if (batchId) {
        const batch = await ImportBatch.findOne({ batchId });
        if (!batch) return res.status(404).json({ message: "Batch not found" });
      }
      if (dateRange) {
        query.saleDate = {};
        if (dateRange.start) query.saleDate.$gte = new Date(dateRange.start);
        if (dateRange.end) query.saleDate.$lte = new Date(dateRange.end);
      }

      // 1. Remove duplicates (based on centerId, mealId, saleDate, saleTime)
      const duplicates = await SalesRecord.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              centerId: "$centerId",
              mealId: "$mealId",
              saleDate: {
                $dateToString: { format: "%Y-%m-%d", date: "$saleDate" },
              },
              saleTime: "$saleTime",
            },
            ids: { $push: "$_id" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ]);

      let duplicatesRemoved = 0;
      for (const dup of duplicates) {
        const idsToRemove = dup.ids.slice(1);
        const result = await SalesRecord.deleteMany({
          _id: { $in: idsToRemove },
        });
        duplicatesRemoved += result.deletedCount;
      }

      // 2. Handle missing values: fill missing customerCount with 0, missing saleTime with '00:00'
      const missingFieldsResult = await SalesRecord.updateMany(
        { customerCount: { $exists: false }, ...query },
        { $set: { customerCount: 0 } }
      );
      const missingTimeResult = await SalesRecord.updateMany(
        { saleTime: { $exists: false }, ...query },
        { $set: { saleTime: "00:00" } }
      );
      const missingValuesFixed =
        missingFieldsResult.modifiedCount + missingTimeResult.modifiedCount;

      // 3. Aggregate data by day/week
      const dailyAggregated = await aggregateSalesData("day", query);
      const weeklyAggregated = await aggregateSalesData("week", query);

      // 4. Feature engineering
      const featuresGenerated = await generateFeatures(query);

      // 5. Log preprocessing
      const totalRecords = await SalesRecord.countDocuments(query);
      const preprocessingLog = new PreprocessingLog({
        batchId: batchId ? (await ImportBatch.findOne({ batchId }))._id : null,
        duplicatesRemoved,
        missingValuesFixed,
        outliersFlagged: 0,
        totalRecordsProcessed: totalRecords,
        featuresGenerated: featuresGenerated.length
          ? Object.keys(featuresGenerated[0])
          : [],
        notes: `Preprocessing completed. Aggregated daily/weekly data.`,
      });
      await preprocessingLog.save();

      res.json({
        message: "Preprocessing completed",
        duplicatesRemoved,
        missingValuesFixed,
        totalRecordsProcessed: totalRecords,
        featuresGenerated: preprocessingLog.featuresGenerated,
        dailyAggregated: dailyAggregated.slice(0, 10),
        weeklyAggregated: weeklyAggregated.slice(0, 10),
      });
    } catch (error) {
      logger.error("Preprocessing error:", error);
      res.status(500).json({ message: "Preprocessing failed" });
    }
  }
);

module.exports = router;
