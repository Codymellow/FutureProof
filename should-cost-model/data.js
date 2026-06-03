// ── FRED Series Configuration ──
// All series are publicly available from the Federal Reserve Bank of St. Louis
// https://fred.stlouisfed.org/

const FRED_SERIES = {
  // Metals & Hardware
  ppi_steel:       'WPU101',
  ppi_metals:      'PCU331331',
  nickel:          'PNICKUSDM',
  copper:          'PCOPPUSDM',
  aluminum:        'PALUMUSDM',
  ppi_nonferrous:  'WPU102',

  // Polymers & Finishes
  ppi_plastics:    'PCU325211325211',
  ppi_finishes:    'WPU0613',
  ppi_chemicals:   'WPU061',
  ppi_foam:        'WPU0722',

  // Packaging & Logistics
  ppi_packaging:   'WPU0915',
  diesel:          'GASDESW',
  ppi_trucking:    'PCU484484',
  natural_gas:     'DHHNGSP',

  // Electronics
  ppi_semiconductors: 'PCU334413334413',
  ppi_electronics:    'PCU3344133441',

  // Textiles
  ppi_textiles:    'WPU03',

  // FX Rates
  fx_mxn:          'DEXMXUS',
  fx_cny:          'DEXCHUS',
  fx_idr:          'DEXINUS',
  fx_thb:          'DEXTHUS',

  // Macro
  ppi_durables:    'WPSFD4131',
};

// Metadata for UI display
const FRED_SERIES_META = {
  ppi_steel:       { label: 'Steel Mill Products PPI', category: 'Metals', unit: 'Index' },
  ppi_metals:      { label: 'Primary Metals PPI', category: 'Metals', unit: 'Index' },
  nickel:          { label: 'Nickel (Global)', category: 'Metals', unit: 'USD/MT' },
  copper:          { label: 'Copper (Global)', category: 'Metals', unit: 'USD/MT' },
  aluminum:        { label: 'Aluminum (Global)', category: 'Metals', unit: 'USD/MT' },
  ppi_nonferrous:  { label: 'Nonferrous Metals PPI', category: 'Metals', unit: 'Index' },
  ppi_plastics:    { label: 'Plastics Products PPI', category: 'Polymers', unit: 'Index' },
  ppi_finishes:    { label: 'Paints & Coatings PPI', category: 'Polymers', unit: 'Index' },
  ppi_chemicals:   { label: 'Industrial Chemicals PPI', category: 'Polymers', unit: 'Index' },
  ppi_foam:        { label: 'Plastic Foam PPI', category: 'Polymers', unit: 'Index' },
  ppi_packaging:   { label: 'Corrugated Boxes PPI', category: 'Packaging', unit: 'Index' },
  diesel:          { label: 'US Diesel Price', category: 'Logistics', unit: '$/gal' },
  ppi_trucking:    { label: 'Truck Transport PPI', category: 'Logistics', unit: 'Index' },
  natural_gas:     { label: 'Henry Hub Natural Gas', category: 'Energy', unit: '$/MMBtu' },
  ppi_semiconductors: { label: 'Semiconductors PPI', category: 'Electronics', unit: 'Index' },
  ppi_electronics:    { label: 'Electronic Components PPI', category: 'Electronics', unit: 'Index' },
  ppi_textiles:    { label: 'Textile Products PPI', category: 'Textiles', unit: 'Index' },
  fx_mxn:          { label: 'USD/MXN', category: 'FX', unit: 'MXN/USD' },
  fx_cny:          { label: 'USD/CNY', category: 'FX', unit: 'CNY/USD' },
  fx_idr:          { label: 'USD/IDR', category: 'FX', unit: 'IDR/USD' },
  fx_thb:          { label: 'USD/THB', category: 'FX', unit: 'THB/USD' },
  ppi_durables:    { label: 'Core PPI: Durable Goods', category: 'Macro', unit: 'Index' },
};

// Regional labor rates (USD/hr, fully loaded)
const LABOR_RATES = {
  china:     6.69,
  mexico:    5.56,
  usa:       28.00,
  vietnam:   3.20,
  indonesia: 3.80,
  thailand:  4.50,
  korea:     18.50,
  japan:     24.00,
};

// ── Sample Category Models ──
// These demonstrate the BOM structure. Replace with your own products.
const CATEGORY_MODELS = {

  // Example: Consumer Electronics Cable
  cables: {
    label: 'USB-C Cables',
    icon: '🔌',
    description: 'USB-C to USB-C braided cables (1m, 2m variants)',
    region: 'china',
    targetMargin: 0.08,
    skus: [
      {
        id: 'cable-usbc-1m',
        label: 'USB-C 1m Braided Cable',
        bom: [
          { id: 'copper_conductor', label: 'Copper conductor wire (28AWG × 4)', unit: 'g', qty: 12, unitCost: 0.008, driver: 'copper', color: '#7c3aed' },
          { id: 'nickel_connector', label: 'Nickel-plated USB-C connectors (×2)', unit: 'pc', qty: 2, unitCost: 0.18, driver: 'nickel', color: '#2563eb' },
          { id: 'nylon_braid', label: 'Nylon braided sleeve (1.2m)', unit: 'm', qty: 1.2, unitCost: 0.06, driver: 'ppi_textiles', color: '#16a34a' },
          { id: 'pvc_jacket', label: 'PVC inner jacket', unit: 'g', qty: 8, unitCost: 0.003, driver: 'ppi_plastics', color: '#d97706' },
          { id: 'pcb_chip', label: 'E-marker IC chip', unit: 'pc', qty: 1, unitCost: 0.22, driver: 'ppi_electronics', color: '#dc2626' },
          { id: 'labor', label: 'Assembly & QC labor', unit: 'min', qty: 3, unitCost: LABOR_RATES.china / 60, driver: null, color: '#ea580c' },
          { id: 'packaging', label: 'Retail packaging', unit: 'pc', qty: 1, unitCost: 0.12, driver: 'ppi_packaging', color: '#6b7280' },
          { id: 'overhead', label: 'Factory overhead (22%)', unit: 'pct', qty: 0.22, unitCost: null, driver: null, color: '#9ca3af', isOverhead: true },
        ],
      },
    ],
  },

  // Example: Mechanical Assembly
  brackets: {
    label: 'Steel Mounting Brackets',
    icon: '🔩',
    description: 'Stamped steel mounting brackets with zinc plating',
    region: 'mexico',
    targetMargin: 0.10,
    skus: [
      {
        id: 'bracket-std',
        label: 'Standard L-Bracket (150mm)',
        bom: [
          { id: 'steel_sheet', label: 'Cold-rolled steel sheet (2mm)', unit: 'kg', qty: 0.35, unitCost: 1.20, driver: 'ppi_steel', color: '#2563eb' },
          { id: 'zinc_plating', label: 'Zinc plating (electrogalvanized)', unit: 'dm²', qty: 4, unitCost: 0.08, driver: 'ppi_nonferrous', color: '#7c3aed' },
          { id: 'hardware', label: 'M6 bolts + nuts (×4)', unit: 'set', qty: 1, unitCost: 0.15, driver: 'ppi_metals', color: '#0891b2' },
          { id: 'labor_stamp', label: 'Stamping + bending labor', unit: 'min', qty: 2, unitCost: LABOR_RATES.mexico / 60, driver: null, color: '#ea580c' },
          { id: 'labor_plate', label: 'Plating labor', unit: 'min', qty: 1.5, unitCost: LABOR_RATES.mexico / 60, driver: null, color: '#f97316' },
          { id: 'packaging', label: 'Bulk packaging (25-pc box)', unit: 'pc', qty: 1, unitCost: 0.04, driver: 'ppi_packaging', color: '#6b7280' },
          { id: 'overhead', label: 'Factory overhead (18%)', unit: 'pct', qty: 0.18, unitCost: null, driver: null, color: '#9ca3af', isOverhead: true },
        ],
      },
    ],
  },

  // Example: Packaging
  retail_box: {
    label: 'Retail Packaging',
    icon: '📦',
    description: 'Printed corrugated retail boxes with foam inserts',
    region: 'china',
    targetMargin: 0.12,
    skus: [
      {
        id: 'box-medium',
        label: 'Medium Retail Box (300×200×100mm)',
        bom: [
          { id: 'corrugated', label: 'B-flute corrugated board', unit: 'sheet', qty: 1, unitCost: 0.42, driver: 'ppi_packaging', color: '#16a34a' },
          { id: 'print', label: '4-color offset print + varnish', unit: 'sheet', qty: 1, unitCost: 0.28, driver: 'ppi_chemicals', color: '#7c3aed' },
          { id: 'foam_insert', label: 'PE foam custom insert', unit: 'pc', qty: 1, unitCost: 0.35, driver: 'ppi_foam', color: '#d97706' },
          { id: 'label', label: 'Barcode label + QC sticker', unit: 'pc', qty: 2, unitCost: 0.02, driver: null, color: '#6b7280' },
          { id: 'labor', label: 'Die-cut + assembly labor', unit: 'min', qty: 2, unitCost: LABOR_RATES.china / 60, driver: null, color: '#ea580c' },
          { id: 'overhead', label: 'Factory overhead (15%)', unit: 'pct', qty: 0.15, unitCost: null, driver: null, color: '#9ca3af', isOverhead: true },
        ],
      },
    ],
  },
};
