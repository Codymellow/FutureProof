// ── Tariff Rate Reference Table ──
// Designed for future API swap — rates can be updated independently
// Source: USITC HTS database + IEEPA executive orders

const COO_TARIFF_RATES = {
  'CN': {
    label: 'China',
    rates: {
      'IEEPA_reciprocal': 0.35,
      'Section_301': 0.25,
      'Section_232_steel': 0.25,
      'base_avg': 0.04,
    },
    effectiveRanges: {
      'cables':      { rate: 0.476, note: '2.6% base + 35% reciprocal + copper surcharge' },
      'cases_bags':  { rate: 0.392, note: '4.2% base + 35% reciprocal' },
      'electronics': { rate: 0.35,  note: 'IEEPA reciprocal rate' },
      'machinery':   { rate: 0.35,  note: 'IEEPA reciprocal rate' },
      'consumer':    { rate: 0.35,  note: 'IEEPA reciprocal rate' },
    },
  },
  'VN': {
    label: 'Vietnam',
    rates: { 'IEEPA_reciprocal': 0.10, 'base_avg': 0.042 },
    effectiveRanges: {
      'cases_bags':  { rate: 0.142, note: '4.2% base + 10% reciprocal' },
      'electronics': { rate: 0.10,  note: 'IEEPA reciprocal' },
    },
  },
  'TH': {
    label: 'Thailand',
    rates: { 'IEEPA_reciprocal': 0.36, 'base_avg': 0.03 },
    effectiveRanges: {
      'electronics': { rate: 0.39, note: '~3% base + 36% reciprocal' },
    },
  },
  'ID': {
    label: 'Indonesia',
    rates: { 'IEEPA_reciprocal': 0.32, 'base_avg': 0.03 },
    effectiveRanges: {
      'consumer':  { rate: 0.35, note: '~3% base + 32% reciprocal' },
    },
  },
  'MY': {
    label: 'Malaysia',
    rates: { 'IEEPA_reciprocal': 0.24, 'base_avg': 0.02 },
    effectiveRanges: {
      'electronics': { rate: 0.26, note: '~2% base + 24% reciprocal' },
    },
  },
  'JP': {
    label: 'Japan',
    rates: { 'IEEPA_reciprocal': 0.10, 'base_avg': 0.03 },
    effectiveRanges: {},
  },
  'KR': {
    label: 'South Korea',
    rates: { 'IEEPA_reciprocal': 0.25, 'base_avg': 0.02 },
    effectiveRanges: {},
  },
  'US': {
    label: 'USA',
    rates: {},
    effectiveRanges: { 'all': { rate: 0, note: 'Domestic — no tariff' } },
  },
  'MX': {
    label: 'Mexico',
    rates: { 'USMCA': 0, 'base_avg': 0 },
    effectiveRanges: { 'all': { rate: 0, note: 'USMCA — duty free' } },
  },
  'CA': {
    label: 'Canada',
    rates: { 'USMCA': 0, 'base_avg': 0 },
    effectiveRanges: { 'all': { rate: 0, note: 'USMCA — duty free' } },
  },
  'DE': {
    label: 'Germany',
    rates: { 'IEEPA_reciprocal': 0.20, 'base_avg': 0.03 },
    effectiveRanges: {},
  },
  'IN': {
    label: 'India',
    rates: { 'IEEPA_reciprocal': 0.26, 'base_avg': 0.04 },
    effectiveRanges: {},
  },
};

// Freight rates as % of FOB value (ocean + inland to DC)
const FREIGHT_RATES_BY_COO = {
  'CN': 0.12, 'VN': 0.14, 'ID': 0.13, 'TH': 0.12, 'KR': 0.10,
  'JP': 0.10, 'MY': 0.12, 'DE': 0.08, 'IN': 0.14,
  'US': 0.03, 'MX': 0.05, 'CA': 0.04,
};

// MPF (0.3464%) + HMF (0.125%) for sea freight
const MPF_HMF_RATE = 0.004714;

// Default for unknown countries
const DEFAULT_FREIGHT_RATE = 0.12;

// HTS prefix to product category mapping
const HTS_CATEGORY_MAP = {
  '8544': 'cables',
  '4202': 'cases_bags',
  '8518': 'electronics',
  '8527': 'electronics',
  '8542': 'electronics',
  '8541': 'electronics',
  '8536': 'electronics',
  '8471': 'electronics',
  '8473': 'electronics',
  '8443': 'machinery',
  '8479': 'machinery',
  '9503': 'consumer',
  '9504': 'consumer',
  '9506': 'consumer',
};
