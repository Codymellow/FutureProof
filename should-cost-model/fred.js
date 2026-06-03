// ── FRED API Integration + Static Fallback ──
// Fetches commodity data from the Federal Reserve Economic Data API.
// Falls back to static data when API is unavailable (CORS, rate limit, offline).

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const CACHE_TTL = 3600 * 1000; // 1 hour cache

// Global commodity data store (populated by loadAllCommodities)
var commodityData = {};

/**
 * Load all configured FRED series.
 * Tries API first, falls back to static data.
 */
async function loadAllCommodities() {
  const apiKey = typeof FRED_API_KEY !== 'undefined' ? FRED_API_KEY : '';

  for (const [key, seriesId] of Object.entries(FRED_SERIES)) {
    try {
      if (apiKey && apiKey !== 'YOUR_API_KEY_HERE') {
        commodityData[key] = await fetchFredSeries(seriesId, apiKey);
      } else {
        commodityData[key] = STATIC_COMMODITY_DATA[key] || {};
      }
    } catch (e) {
      console.warn(`FRED fetch failed for ${key}, using static fallback:`, e.message);
      commodityData[key] = STATIC_COMMODITY_DATA[key] || {};
    }
  }
  console.log(`Commodity data loaded: ${Object.keys(commodityData).length} series`);
}

/**
 * Fetch a single FRED series and return as { 'YYYY-MM': value } map.
 */
async function fetchFredSeries(seriesId, apiKey) {
  // Check cache
  const cacheKey = `fred_${seriesId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, ts } = JSON.parse(cached);
    if (Date.now() - ts < CACHE_TTL) return data;
  }

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=2020-01-01&frequency=m`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();

  const data = {};
  for (const obs of json.observations || []) {
    if (obs.value === '.') continue;
    const month = obs.date.substring(0, 7); // YYYY-MM
    data[month] = parseFloat(obs.value);
  }

  // Cache
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) { /* localStorage full — ignore */ }

  return data;
}

// ── Static fallback data (sample — copper and aluminum) ──
// In production, populate this with historical data for offline use
const STATIC_COMMODITY_DATA = {
  copper: {
    '2022-01': 9782, '2022-06': 9068, '2022-12': 8371,
    '2023-01': 9007, '2023-06': 8397, '2023-12': 8408,
    '2024-01': 8351, '2024-06': 9648, '2024-12': 8910,
    '2025-01': 8977, '2025-06': 9835, '2025-12': 11791,
  },
  aluminum: {
    '2022-01': 3006, '2022-06': 2576, '2022-12': 2398,
    '2023-01': 2495, '2023-06': 2185, '2023-12': 2192,
    '2024-01': 2202, '2024-06': 2498, '2024-12': 2541,
    '2025-01': 2571, '2025-06': 2526, '2025-12': 2876,
  },
  nickel: {
    '2022-01': 22300, '2022-06': 25700, '2022-12': 29800,
    '2023-01': 28500, '2023-06': 21200, '2023-12': 16500,
    '2024-01': 16100, '2024-06': 17800, '2024-12': 15400,
    '2025-01': 15600, '2025-06': 15100, '2025-12': 14800,
  },
  ppi_steel: {
    '2022-01': 380, '2022-06': 340, '2022-12': 290,
    '2023-01': 285, '2023-06': 270, '2023-12': 265,
    '2024-01': 268, '2024-06': 275, '2024-12': 280,
    '2025-01': 282, '2025-06': 290, '2025-12': 295,
  },
  ppi_plastics: {
    '2022-01': 155, '2022-06': 160, '2022-12': 148,
    '2023-01': 145, '2023-06': 140, '2023-12': 138,
    '2024-01': 139, '2024-06': 142, '2024-12': 145,
    '2025-01': 147, '2025-06': 150, '2025-12': 153,
  },
  ppi_packaging: {
    '2022-01': 210, '2022-06': 225, '2022-12': 218,
    '2023-01': 215, '2023-06': 210, '2023-12': 208,
    '2024-01': 210, '2024-06': 215, '2024-12': 220,
    '2025-01': 222, '2025-06': 225, '2025-12': 228,
  },
  ppi_textiles: {
    '2022-01': 118, '2022-06': 120, '2022-12': 119,
    '2023-01': 118, '2023-06': 117, '2023-12': 116,
    '2024-01': 117, '2024-06': 118, '2024-12': 119,
    '2025-01': 120, '2025-06': 121, '2025-12': 122,
  },
  ppi_electronics: {
    '2022-01': 102, '2022-06': 100, '2022-12': 98,
    '2023-01': 97, '2023-06': 95, '2023-12': 94,
    '2024-01': 93, '2024-06': 92, '2024-12': 91,
    '2025-01': 90, '2025-06': 89, '2025-12': 88,
  },
  ppi_nonferrous: {
    '2022-01': 320, '2022-06': 290, '2022-12': 275,
    '2023-01': 280, '2023-06': 265, '2023-12': 270,
    '2024-01': 272, '2024-06': 280, '2024-12': 285,
    '2025-01': 288, '2025-06': 295, '2025-12': 300,
  },
  ppi_chemicals: {
    '2022-01': 145, '2022-06': 155, '2022-12': 148,
    '2023-01': 144, '2023-06': 140, '2023-12': 138,
    '2024-01': 139, '2024-06': 141, '2024-12': 143,
    '2025-01': 144, '2025-06': 146, '2025-12': 148,
  },
  ppi_foam: {
    '2022-01': 130, '2022-06': 135, '2022-12': 128,
    '2023-01': 125, '2023-06': 122, '2023-12': 120,
    '2024-01': 121, '2024-06': 123, '2024-12': 125,
    '2025-01': 126, '2025-06': 128, '2025-12': 130,
  },
  ppi_finishes: {
    '2022-01': 125, '2022-06': 130, '2022-12': 128,
    '2023-01': 126, '2023-06': 125, '2023-12': 124,
    '2024-01': 125, '2024-06': 126, '2024-12': 127,
    '2025-01': 128, '2025-06': 129, '2025-12': 130,
  },
  diesel: {
    '2022-01': 3.72, '2022-06': 5.75, '2022-12': 4.71,
    '2023-01': 4.58, '2023-06': 3.80, '2023-12': 3.97,
    '2024-01': 3.85, '2024-06': 3.72, '2024-12': 3.49,
    '2025-01': 3.63, '2025-06': 3.60, '2025-12': 3.62,
  },
};
