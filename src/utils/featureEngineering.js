const SalesRecord = require("../models/SalesRecord");

async function generateFeatures(query = {}) {
  // Fetch sales records grouped by day
  const dailySales = await SalesRecord.aggregate([
    { $match: query },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } },
        totalQuantity: { $sum: "$quantity" },
        totalCustomers: { $sum: "$customerCount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Build feature dataset
  const features = [];
  for (let i = 0; i < dailySales.length; i++) {
    const dateStr = dailySales[i]._id;
    const date = new Date(dateStr);
    const weekOfYear = getWeekOfYear(date);
    const month = date.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Lag values
    const lag1 = i > 0 ? dailySales[i - 1].totalQuantity : null;
    const lag7 = i >= 7 ? dailySales[i - 7].totalQuantity : null;

    // Rolling averages
    const rollingAvg7 =
      i >= 6
        ? dailySales
            .slice(i - 6, i + 1)
            .reduce((sum, d) => sum + d.totalQuantity, 0) / 7
        : null;
    const rollingAvg30 =
      i >= 29
        ? dailySales
            .slice(i - 29, i + 1)
            .reduce((sum, d) => sum + d.totalQuantity, 0) / 30
        : null;

    features.push({
      date: dateStr,
      totalQuantity: dailySales[i].totalQuantity,
      totalCustomers: dailySales[i].totalCustomers,
      week_of_year: weekOfYear,
      month,
      quarter,
      day_of_week: dayOfWeek,
      is_weekend: isWeekend,
      lag_1: lag1,
      lag_7: lag7,
      rolling_avg_7: rollingAvg7,
      rolling_avg_30: rollingAvg30,
    });
  }

  return features;
}

function getWeekOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - start) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + start.getDay() + 1) / 7);
}

module.exports = { generateFeatures };
