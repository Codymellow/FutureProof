# Should-Cost Modeling Framework

**This tool answers "what should this product cost?" using commodity market data, BOM decomposition, and public indices — giving procurement teams a data-backed negotiating position before every supplier conversation.**

Most sourcing teams negotiate against last year's price plus a gut feeling. This framework builds bottom-up cost models from component-level BOMs, links each material to public commodity indices (FRED API), and computes a real-time "should cost" that moves with the market. When your should-cost says $12.40 and the supplier quotes $14.80, you have a specific, defensible conversation about the +19% variance.

## What It Does

1. **Defines component-level BOMs** — material quantity, unit cost, commodity driver, labor content
2. **Pulls real-time commodity data** from the [FRED API](https://fred.stlouisfed.org/) (free, public, no proprietary data)
3. **Computes should-cost** by applying commodity multipliers to base material costs
4. **Generates 12-month forecasts** via linear regression on trailing commodity data (with confidence intervals)
5. **Produces action recommendations** based on actual-vs-should variance (negotiate / monitor / validate)
6. **Serves a dashboard** showing cost trends, driver attribution, and confidence indicators

## Architecture

![Should-Cost Architecture](assets/architecture.svg)

## Key Concepts

### How Commodity Prices Flow to Should-Cost

![Commodity Impact](assets/commodity-impact.svg)

### Commodity Multiplier
Each BOM component is linked to a FRED series. The multiplier normalizes the current index value against a base period, so a copper price of $9,500/MT against a 2020 base of $6,000/MT produces a multiplier of 1.58×.

### Confidence Indicator
Model confidence is driven by three factors:
- **SKU coverage** — how many real products validate this model
- **Commodity correlation** — what % of BOM cost is driven by indexed commodities
- **Data freshness** — days since last FRED data point

### Action Recommendations
| Variance | Recommendation |
|----------|----------------|
| >+15% | Initiate cost reduction conversation |
| +5% to +15% | Request updated cost breakdown |
| ±5% | Monitor — pricing aligned with market |
| <-5% | Validate quality/scope — supplier may be cutting corners |

## Quick Start

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/should-cost-model.git
cd should-cost-model

# Install dependencies
npm install

# Get a free FRED API key: https://fred.stlouisfed.org/docs/api/api_key.html
cp config.example.js config.js
# Edit config.js and add your FRED_API_KEY

# Open in browser (no build step needed — vanilla JS)
# Or use any static file server:
npx serve .
```

## Project Structure

```
should-cost-model/
├── README.md
├── index.html              # Single-page dashboard
├── config.example.js       # FRED API key placeholder
├── package.json
├── styles.css
├── app.js                  # Navigation, rendering, boot
├── data.js                 # FRED series config, labor rates, BOM models
├── models.js               # Should-cost engine, forecasting, confidence
├── fred.js                 # FRED API integration + static fallback
├── charts.js               # Chart rendering (Chart.js)
└── sample-boms/
    ├── electronics.json    # Example: consumer electronics BOM
    ├── mechanical.json     # Example: precision mechanical assembly
    └── packaging.json      # Example: retail packaging set
```

## FRED Series Used

| Category | Series | What It Tracks |
|----------|--------|----------------|
| Metals | `PCOPPUSDM` | Global copper price (wiring, electronics) |
| Metals | `PNICKUSDM` | Global nickel price (plating, alloys) |
| Metals | `PALUMUSDM` | Global aluminum price (housings, chassis) |
| Steel | `WPU101` | PPI: Steel mill products |
| Plastics | `PCU325211325211` | PPI: Plastics products |
| Coatings | `WPU0613` | PPI: Paints & coatings |
| Packaging | `WPU0915` | PPI: Corrugated boxes |
| Energy | `GASDESW` | US diesel price (logistics) |
| FX | `DEXMXUS` | USD/MXN (Mexico manufacturing) |
| FX | `DEXCHUS` | USD/CNY (China sourcing) |
| FX | `DEXINUS` | USD/IDR (Indonesia manufacturing) |

All series are publicly available at no cost from the Federal Reserve Bank of St. Louis.

## Methodology

### Should-Cost Calculation

```
For each component in BOM:
  component_cost = quantity × base_unit_cost × commodity_multiplier(month)

overhead_cost = Σ(component_costs) × overhead_rate
supplier_margin = (Σ(component_costs) + overhead) × target_margin

should_cost = Σ(component_costs) + overhead + supplier_margin
```

### 12-Month Forecast

Uses ordinary least-squares linear regression on trailing 24 months of commodity data:
- Projects each driver forward independently
- Combines via the BOM model to produce a should-cost trajectory
- Confidence interval: ±1.5σ of the regression standard error

### Data Conventions
- All costs in USD with 2 decimal places
- Time series carry `asOfDate` on every record
- Forecasts beyond observed data are flagged and bounded
- Driver attribution required for every predicted value

## Extending the Model

To add a new product category:

```javascript
const MY_PRODUCT = {
  label: 'Widget Assembly',
  icon: '⚙️',
  targetMargin: 0.08,  // 8% supplier margin assumption
  skus: [{
    id: 'widget-standard',
    label: 'Standard Widget',
    bom: [
      { id: 'steel_housing', label: 'Steel housing', unit: 'kg', qty: 0.5, unitCost: 2.80, driver: 'ppi_steel', color: '#2563eb' },
      { id: 'copper_wiring', label: 'Copper wiring', unit: 'g', qty: 15, unitCost: 0.008, driver: 'copper', color: '#7c3aed' },
      { id: 'labor', label: 'Assembly labor', unit: 'min', qty: 12, unitCost: 0.11, driver: null, color: '#ea580c' },
      { id: 'overhead', label: 'Factory overhead (20%)', unit: 'pct', qty: 0.20, unitCost: null, driver: null, color: '#6b7280', isOverhead: true },
    ],
  }],
};
```

## License

MIT
