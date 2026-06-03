// ── Should-Cost Calculation Engine ──
// Pure functions: BOM → commodity multipliers → cost breakdown → forecast

/**
 * Calculate should-cost for a specific SKU in a given month.
 * Applies commodity multipliers to each BOM component.
 */
function calculateShouldCostForSku(categoryKey, skuId, month) {
  const model = CATEGORY_MODELS[categoryKey];
  if (!model) return null;
  const sku = model.skus.find(s => s.id === skuId);
  if (!sku) return null;

  const bom = sku.bom;
  const breakdown = [];
  let subtotal = 0;

  for (const comp of bom) {
    if (comp.isOverhead) continue;
    const multiplier = getCommodityMultiplier(comp.driver, month);
    const cost = comp.qty * comp.unitCost * multiplier;
    subtotal += cost;
    breakdown.push({
      id: comp.id, label: comp.label, cost, color: comp.color,
      driver: comp.driver, multiplier, qty: comp.qty, unit: comp.unit, unitCost: comp.unitCost,
    });
  }

  // Overhead as % of subtotal
  const overheadComp = bom.find(c => c.isOverhead);
  const overheadCost = overheadComp ? subtotal * overheadComp.qty : 0;
  if (overheadComp) {
    breakdown.push({
      id: 'overhead', label: overheadComp.label,
      cost: overheadCost, color: overheadComp.color, driver: null, multiplier: 1,
    });
  }

  // Supplier margin
  const totalBeforeMargin = subtotal + overheadCost;
  const supplierMargin = totalBeforeMargin * model.targetMargin;
  const total = totalBeforeMargin + supplierMargin;
  breakdown.push({
    id: 'margin',
    label: `Supplier margin (${(model.targetMargin * 100).toFixed(0)}%)`,
    cost: supplierMargin, color: '#9ca3af', driver: null, multiplier: 1,
  });

  // Compute percentages
  breakdown.forEach(b => { b.pct = total > 0 ? b.cost / total : 0; });

  return { total, subtotal, overheadCost, supplierMargin, breakdown };
}

/**
 * Get commodity multiplier for a given driver and month.
 * Multiplier = current_value / base_period_average
 */
function getCommodityMultiplier(driverKey, month) {
  if (!driverKey || !commodityData[driverKey]) return 1.0;
  const series = commodityData[driverKey];
  const value = getClosestValue(series, month);
  const baseAvg = getSeriesAverage(series, '2022');
  if (!baseAvg || baseAvg === 0) return 1.0;
  return value / baseAvg;
}

function getClosestValue(series, month) {
  if (series[month]) return series[month];
  const keys = Object.keys(series).sort();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i] <= month) return series[keys[i]];
  }
  return series[keys[0]] || 1;
}

function getSeriesAverage(series, year) {
  const keys = Object.keys(series).filter(k => k.startsWith(year));
  if (!keys.length) return null;
  const sum = keys.reduce((s, k) => s + series[k], 0);
  return sum / keys.length;
}

/**
 * Build 12-month historical + 12-month forecast time series.
 */
function buildForecastSeries(categoryKey, skuId, trailingMonths) {
  const model = CATEGORY_MODELS[categoryKey];
  if (!model) return [];
  const sku = model.skus.find(s => s.id === skuId) || model.skus[0];
  const currentMonth = getCurrentMonth();

  // Historical: last 12 months
  const historicalMonths = generateMonths(getPrevMonthN(currentMonth, 11), currentMonth);
  const historical = historicalMonths.map(month => ({
    month, type: 'historical',
    shouldCost: calculateShouldCostForSku(categoryKey, sku.id, month)?.total || 0,
    upper: null, lower: null,
  }));

  // Forecast: next 12 months
  const forecast = [];
  for (let i = 1; i <= 12; i++) {
    const futureMonth = getNextMonthN(currentMonth, i);
    const bom = sku.bom;
    let subtotal = 0, subtotalUpper = 0, subtotalLower = 0;

    for (const comp of bom) {
      if (comp.isOverhead) continue;
      const fc = forecastCommodityMultiplier(comp.driver, i, trailingMonths || 24);
      subtotal += comp.qty * comp.unitCost * fc.value;
      subtotalUpper += comp.qty * comp.unitCost * fc.upper;
      subtotalLower += comp.qty * comp.unitCost * fc.lower;
    }

    const overheadComp = bom.find(c => c.isOverhead);
    const oh = overheadComp ? overheadComp.qty : 0;
    const total = (subtotal + subtotal * oh) * (1 + model.targetMargin);
    const upper = (subtotalUpper + subtotalUpper * oh) * (1 + model.targetMargin);
    const lower = (subtotalLower + subtotalLower * oh) * (1 + model.targetMargin);

    forecast.push({ month: futureMonth, type: 'forecast', shouldCost: total, upper, lower });
  }

  return [...historical, ...forecast];
}

/**
 * Linear regression on trailing commodity data to project forward.
 */
function forecastCommodityMultiplier(driverKey, monthsForward, trailingMonths) {
  if (!driverKey || !commodityData[driverKey]) return { value: 1, upper: 1, lower: 1, r2: 0 };

  const series = commodityData[driverKey];
  const allMonths = Object.keys(series).sort();
  const recentMonths = allMonths.slice(-(trailingMonths || 24));
  if (recentMonths.length < 3) return { value: 1, upper: 1, lower: 1, r2: 0 };

  const baseAvg = getSeriesAverage(series, '2022') || 1;
  const xArr = recentMonths.map((_, i) => i);
  const yArr = recentMonths.map(m => (series[m] || baseAvg) / baseAvg);

  const reg = linearRegression(xArr, yArr);
  const futureX = recentMonths.length - 1 + monthsForward;
  const predicted = reg.slope * futureX + reg.intercept;

  return {
    value: Math.max(0.1, predicted),
    upper: Math.max(0.1, predicted + reg.stdErr * 1.5),
    lower: Math.max(0.1, predicted - reg.stdErr * 1.5),
    r2: reg.r2,
  };
}

/**
 * Ordinary least-squares linear regression.
 */
function linearRegression(xArr, yArr) {
  const n = xArr.length;
  if (n < 2) return { slope: 0, intercept: yArr[0] || 0, r2: 0, stdErr: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xArr[i]; sumY += yArr[i];
    sumXY += xArr[i] * yArr[i]; sumX2 += xArr[i] * xArr[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0, stdErr: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (yArr[i] - yMean) ** 2;
    ssRes += (yArr[i] - (slope * xArr[i] + intercept)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const stdErr = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { slope, intercept, r2, stdErr };
}

/**
 * Confidence indicator based on data quality.
 */
function getConfidenceIndicator(categoryKey) {
  const model = CATEGORY_MODELS[categoryKey];
  if (!model) return { level: 'low', label: 'Low' };

  const skuCount = model.skus.length;
  const correlation = getCommodityCorrelation(categoryKey);
  const dataAgeDays = getDataAgeDays();

  const skuLevel = skuCount >= 3 ? 'high' : skuCount === 2 ? 'medium' : 'low';
  const corrLevel = correlation >= 0.80 ? 'high' : correlation >= 0.60 ? 'medium' : 'low';
  const freshLevel = dataAgeDays <= 30 ? 'high' : dataAgeDays <= 60 ? 'medium' : 'low';

  const levels = [skuLevel, corrLevel, freshLevel];
  let overall = 'high';
  if (levels.includes('low')) overall = 'low';
  else if (levels.includes('medium')) overall = 'medium';

  return { level: overall, label: overall.charAt(0).toUpperCase() + overall.slice(1), skuCount, correlation, dataAgeDays };
}

function getCommodityCorrelation(categoryKey) {
  const model = CATEGORY_MODELS[categoryKey];
  if (!model) return 0;
  const result = calculateShouldCostForSku(categoryKey, model.skus[0].id, getCurrentMonth());
  if (!result || result.total <= 0) return 0;
  const driverCost = result.breakdown.filter(b => b.driver && b.id !== 'overhead' && b.id !== 'margin').reduce((s, b) => s + b.cost, 0);
  const directCost = result.breakdown.filter(b => b.id !== 'overhead' && b.id !== 'margin').reduce((s, b) => s + b.cost, 0);
  return directCost > 0 ? driverCost / directCost : 0;
}

function getDataAgeDays() {
  const series = commodityData['copper'] || {};
  const keys = Object.keys(series).sort();
  if (!keys.length) return 999;
  const latestDate = new Date(keys[keys.length - 1] + '-01');
  return Math.max(0, Math.floor((new Date() - latestDate) / (1000 * 60 * 60 * 24)));
}

/**
 * Action recommendation based on actual-vs-should variance.
 */
function getActionRecommendation(variancePct) {
  if (variancePct == null) return null;
  if (variancePct > 0.15) return { text: 'Initiate cost reduction conversation', color: '#dc2626', icon: '🔴' };
  if (variancePct > 0.05) return { text: 'Request updated cost breakdown', color: '#d97706', icon: '🟡' };
  if (variancePct >= -0.05) return { text: 'Monitor — pricing aligned with market', color: '#6b7280', icon: '⚪' };
  return { text: 'Validate quality/scope — potential supplier risk', color: '#2563eb', icon: '🔵' };
}

// ── Utility functions ──
function getCurrentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function getPrevMonthN(month, n) {
  let [y, m] = month.split('-').map(Number);
  for (let i = 0; i < n; i++) { m--; if (m < 1) { m = 12; y--; } }
  return y + '-' + String(m).padStart(2, '0');
}
function getNextMonthN(month, n) {
  let [y, m] = month.split('-').map(Number);
  for (let i = 0; i < n; i++) { m++; if (m > 12) { m = 1; y++; } }
  return y + '-' + String(m).padStart(2, '0');
}
function generateMonths(start, end) {
  const months = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(y + '-' + String(m).padStart(2, '0'));
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}
function formatCurrency(val) { return val == null ? '—' : '$' + val.toFixed(2); }
function formatPct(val) { return val == null ? '—' : (val >= 0 ? '+' : '') + (val * 100).toFixed(1) + '%'; }
