# Tariff & Landed Cost Calculator

**This tool computes the true cost of importing goods — not just the FOB price your supplier quotes, but the full landed cost including freight, duty, MPF/HMF, and inland transport — so sourcing teams can compare suppliers across countries on an equal basis.**

A supplier in China quoting $50 and a supplier in Mexico quoting $58 are not $8 apart. After freight, tariffs (potentially 35%+ IEEPA reciprocal), and logistics, the China supplier might land at $74 while Mexico lands at $61. This tool makes that math automatic and keeps it current as tariff policy changes.

## What It Does

1. **Loads SKU-level pricing data** (CSV/Excel upload — SAP material pricing export format)
2. **Looks up tariff rates** by HTS code and country of origin (static rate table + API shell for Descartes)
3. **Computes full landed cost**: FOB + ocean freight + duty + MPF/HMF + inland
4. **Calculates true margin** from landed cost (not just FOB markup)
5. **Models tariff scenarios** — "what if rates change by X%?" across your portfolio
6. **Identifies concentration risk** — how exposed are you to any single country?
7. **Detects rate changes** over time and calculates annualized impact

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   SKU DATA (CSV/XLSX Upload)                      │
│  Material │ HTS Code │ COO │ FOB Price │ Net Price │ Supplier    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TARIFF RATE ENGINE                              │
│  HTS Code + COO → { base_duty, IEEPA, Section 301/232, total } │
│  Source: Static tables (HTS lookup) or Descartes API             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LANDED COST CALCULATOR                           │
│                                                                  │
│  landed = FOB                                                    │
│         + FOB × freight_rate_by_coo                              │
│         + FOB × duty_rate (HTS + COO specific)                   │
│         + FOB × MPF_HMF_rate (0.4714%)                          │
│                                                                  │
│  true_margin = (dealer_net - landed) / dealer_net                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │  Margin      │ │  Scenario    │ │Concentration │
   │  Analysis    │ │  Modeling    │ │   Risk       │
   └──────────────┘ └──────────────┘ └──────────────┘
```

## Current Tariff Rate Table (US Import)

| Country | Base Avg | IEEPA Reciprocal | Effective Range |
|---------|----------|-----------------|-----------------|
| China (CN) | ~4% | 35% | 35–47% depending on product |
| Indonesia (ID) | ~3% | 32% | ~35% |
| Thailand (TH) | ~3% | 36% | ~38% |
| Vietnam (VN) | ~4% | 10% | ~14% |
| Malaysia (MY) | ~2% | 24% | ~26% |
| Japan (JP) | ~3% | 10% | ~13% |
| S. Korea (KR) | ~2% | 25% | ~27% |
| Mexico (MX) | 0% | 0% (USMCA) | 0% |
| Canada (CA) | 0% | 0% (USMCA) | 0% |

*Rates as of early 2026. Subject to change with trade policy.*

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/tariff-landed-cost.git
cd tariff-landed-cost

# No build step — open index.html directly or use a static server:
npx serve .
```

Upload a CSV/Excel with columns: Material, Description, PL2, Plant, Supplier, StdNet, StdCost, PB00, Currency, Per, COO, HTS Code.

## Project Structure

```
tariff-landed-cost/
├── README.md
├── index.html              # Single-page dashboard
├── styles.css
├── tariff-engine.js        # Core: rate lookup, landed cost, margin, scenarios
├── data.js                 # Tariff rates, freight rates, HTS category mapping
├── app.js                  # UI controller and rendering
├── charts.js               # Visualization (Chart.js)
└── sample-data/
    └── example-skus.csv    # Sample data for testing (synthetic)
```

## Landed Cost Formula

```
customs_value = FOB (purchase price per unit)
freight = FOB × freight_rate_by_country_of_origin
duty = customs_value × effective_tariff_rate(HTS_code, COO)
mpf_hmf = customs_value × 0.004714  (Merchandise Processing Fee + Harbor Maintenance Fee)

landed_cost = FOB + freight + duty + mpf_hmf
true_margin = (net_selling_price - landed_cost) / net_selling_price
```

## Freight Rate Assumptions (by COO)

| Origin | Rate (% of FOB) | Basis |
|--------|-----------------|-------|
| China | 12% | Ocean Shanghai/Shenzhen → US West |
| Indonesia | 13% | Ocean Jakarta → US West |
| Vietnam | 14% | Ocean HCMC → US West |
| Thailand | 12% | Ocean Laem Chabang → US West |
| Japan | 10% | Ocean Yokohama → US West |
| S. Korea | 10% | Ocean Busan → US West |
| Mexico | 5% | Truck/rail |
| US Domestic | 3% | Inland freight only |

## Scenario Modeling

The tool supports "what-if" analysis:
- **Rate change**: "What if China tariffs increase by 10%?"
- **Country shift**: "What if we move these SKUs from CN to VN?"
- **Margin impact**: "Which SKUs fall below 15% margin at the new rate?"

## Key Features

- **Data quality filters** — automatically excludes placeholder SKUs (zero pricing, currency mismatches)
- **HTS-to-product category mapping** — matches 4-digit HTS prefix to product types for rate precision
- **Change detection** — compares current rates against previous to flag policy changes
- **Concentration analysis** — surfaces over-dependence on any single country of origin
- **Descartes API shell** — ready for live rate lookup when API access is available

## Extending

To add a new country:

```javascript
COO_TARIFF_RATES['XX'] = {
  label: 'Country Name',
  rates: {
    'IEEPA_reciprocal': 0.15,  // 15% reciprocal tariff
    'base_avg': 0.03,           // 3% average HTS base rate
  },
  effectiveRanges: {
    'electronics': { rate: 0.18, note: '3% base + 15% reciprocal' },
  },
};

FREIGHT_RATES_BY_COO['XX'] = 0.11;  // 11% of FOB for freight
```

## License

MIT
