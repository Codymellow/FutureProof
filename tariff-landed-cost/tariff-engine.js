// ── Tariff & Landed Cost Engine ──
// Core calculation functions — no proprietary data, all generic

/**
 * Look up effective duty rate for a given HTS code and country of origin.
 * Tries product-category-specific rate first, falls back to base + IEEPA.
 */
function getEffectiveDutyRate(htsCode, coo) {
  const countryRates = COO_TARIFF_RATES[coo];
  if (!countryRates) return { baseDuty: 0, totalEffective: 0, source: 'no data' };

  const baseRate = countryRates.rates['base_avg'] || 0;
  const ieepa = countryRates.rates['IEEPA_reciprocal'] || 0;
  let effectiveRate = baseRate + ieepa;
  let matchedCategory = null;

  // Try HTS prefix match for specific rate
  const hts4 = (htsCode || '').substring(0, 4);
  const category = HTS_CATEGORY_MAP[hts4];
  if (category && countryRates.effectiveRanges[category]) {
    effectiveRate = countryRates.effectiveRanges[category].rate;
    matchedCategory = category;
  }

  const additionalDuties = [];
  if (ieepa > 0) additionalDuties.push({ type: 'IEEPA Reciprocal', rate: ieepa });
  if (countryRates.rates['Section_301'] > 0) additionalDuties.push({ type: 'Section 301', rate: countryRates.rates['Section_301'] });
  if (countryRates.rates['Section_232_steel'] > 0) additionalDuties.push({ type: 'Section 232', rate: countryRates.rates['Section_232_steel'] });

  return {
    baseDuty: baseRate,
    additionalDuties,
    totalEffective: effectiveRate,
    matchedCategory,
    source: 'static',
  };
}

/**
 * Compute full landed cost for a single SKU.
 * Returns breakdown: FOB + freight + duty + MPF/HMF = landed
 */
function computeLandedCost(sku) {
  const fob = sku.fobPrice || 0;
  const freightRate = FREIGHT_RATES_BY_COO[sku.coo] || DEFAULT_FREIGHT_RATE;
  const dutyResult = getEffectiveDutyRate(sku.htsCode, sku.coo);
  const dutyRate = dutyResult.totalEffective;

  const freight = fob * freightRate;
  const duty = fob * dutyRate;
  const mpfHmf = fob * MPF_HMF_RATE;
  const landed = fob + freight + duty + mpfHmf;

  return {
    fob,
    freight,
    freightRate,
    duty,
    dutyRate,
    dutyDetail: dutyResult,
    mpfHmf,
    landed,
  };
}

/**
 * Compute true margin from landed cost (not FOB).
 */
function computeMarginFromLanded(netSellingPrice, landedCost) {
  return {
    netSellingPrice,
    landed: landedCost.landed,
    marginDollars: netSellingPrice - landedCost.landed,
    marginPct: netSellingPrice > 0 ? (netSellingPrice - landedCost.landed) / netSellingPrice : 0,
  };
}

/**
 * Scenario: compute margin impact of a tariff rate change.
 */
function computeScenarioImpact(skus, rateChange) {
  return skus.map(function(sku) {
    const currentLanded = computeLandedCost(sku);
    const currentMargin = computeMarginFromLanded(sku.netPrice, currentLanded);

    // Apply rate change to duty
    const newDutyRate = currentLanded.dutyRate + rateChange;
    const newDuty = sku.fobPrice * Math.max(0, newDutyRate);
    const newLanded = sku.fobPrice + currentLanded.freight + newDuty + currentLanded.mpfHmf;
    const newMargin = sku.netPrice > 0 ? (sku.netPrice - newLanded) / sku.netPrice : 0;

    return {
      material: sku.material,
      description: sku.description,
      coo: sku.coo,
      htsCode: sku.htsCode,
      fob: sku.fobPrice,
      currentLanded: currentLanded.landed,
      newLanded: newLanded,
      currentMargin: currentMargin.marginPct,
      newMargin: newMargin,
      marginChange: newMargin - currentMargin.marginPct,
      dutyIncrease: newDuty - currentLanded.duty,
    };
  });
}

/**
 * Compute origin concentration metrics.
 */
function computeOriginConcentration(skus) {
  const byCoo = {};
  let totalSpend = 0;

  skus.forEach(function(sku) {
    if (!byCoo[sku.coo]) byCoo[sku.coo] = 0;
    byCoo[sku.coo] += sku.fobPrice;
    totalSpend += sku.fobPrice;
  });

  const sorted = Object.entries(byCoo).sort(function(a, b) { return b[1] - a[1]; });
  const top2 = sorted.slice(0, 2);
  const top2Share = totalSpend > 0 ? top2.reduce(function(s, e) { return s + e[1]; }, 0) / totalSpend : 0;

  return {
    totalSpend,
    top2Share,
    all: sorted.map(function(e) {
      return { coo: e[0], spend: e[1], pct: totalSpend > 0 ? e[1] / totalSpend : 0 };
    }),
  };
}

/**
 * Data quality filter — exclude placeholder/invalid SKUs.
 */
function isValidForTariffAnalysis(sku) {
  if (!sku.netPrice || sku.netPrice < 1) return false;
  if (!sku.fobPrice || sku.fobPrice <= 0) return false;
  if (sku.netPrice < sku.fobPrice) return false; // currency mismatch
  return true;
}

/**
 * Parse CSV/Excel upload into structured SKU objects.
 */
function parseSkuUpload(rows) {
  return rows.map(function(row) {
    return {
      material: String(row.material || '').trim(),
      description: String(row.description || '').trim(),
      supplier: String(row.supplier || '').trim(),
      fobPrice: parseFloat(row.fobPrice || row.pb00) || 0,
      netPrice: parseFloat(row.netPrice || row.stdNet) || 0,
      stdCost: parseFloat(row.stdCost) || 0,
      coo: String(row.coo || row.countryOfOrigin || '').trim().toUpperCase(),
      htsCode: String(row.htsCode || '').trim(),
    };
  }).filter(function(sku) { return sku.material; });
}

/**
 * Summary statistics across all valid SKUs.
 */
function computePortfolioSummary(skus) {
  const valid = skus.filter(isValidForTariffAnalysis);
  let totalDuty = 0, totalRevenue = 0, totalLanded = 0, atRiskCount = 0;

  valid.forEach(function(sku) {
    const lc = computeLandedCost(sku);
    const margin = computeMarginFromLanded(sku.netPrice, lc);
    totalDuty += lc.duty;
    totalRevenue += sku.netPrice;
    totalLanded += lc.landed;
    if (margin.marginPct < 0.15) atRiskCount++;
  });

  return {
    totalSkus: valid.length,
    totalDuty,
    totalRevenue,
    totalLanded,
    weightedMargin: totalRevenue > 0 ? (totalRevenue - totalLanded) / totalRevenue : 0,
    atRiskCount,
    concentration: computeOriginConcentration(valid),
  };
}
