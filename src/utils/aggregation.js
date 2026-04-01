const SalesRecord = require("../models/SalesRecord");

async function aggregateSalesData(interval, query = {}) {
  let groupByFormat;
  if (interval === "day") {
    groupByFormat = {
      $dateToString: { format: "%Y-%m-%d", date: "$saleDate" },
    };
  } else if (interval === "week") {
    groupByFormat = {
      $dateToString: {
        format: "%Y-%U",
        date: "$saleDate",
      },
    };
  } else {
    throw new Error("Invalid interval");
  }

  const aggregated = await SalesRecord.aggregate([
    { $match: query },
    {
      $group: {
        _id: groupByFormat,
        totalQuantity: { $sum: "$quantity" },
        totalCustomers: { $sum: "$customerCount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return aggregated;
}

module.exports = { aggregateSalesData };
