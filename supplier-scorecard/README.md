# Supplier Scorecard

**This tool gives sourcing teams a single, defensible number for every supplier — weighted across delivery, quality, cost, and communication — so that quarterly business reviews are backed by data, not anecdotes.**

Most supplier performance conversations start with "I feel like they've been better lately" or "their quality seems off." This scorecard replaces feelings with math: four pillar scores, a composite, a tier classification, and RAG indicators that surface problems before they become crises.

## What It Does

1. **Scores suppliers across 4 pillars**: Ship-on-Time (SOT), Quality (PPM), Pricing (vs. market inflation), Communication (stakeholder survey)
2. **Computes a weighted composite** (35% SOT + 25% Quality + 20% Pricing + 20% Communication)
3. **Classifies tiers**: Strategic / Preferred / Approved / Conditional — with red-flag overrides
4. **Generates external PDFs** for supplier business reviews (internal data stripped automatically)
5. **Tracks trends** — month-over-month, quarter-over-quarter performance changes
6. **Surfaces exceptions** — suppliers crossing tier boundaries or hitting multiple red pillars

## Pillar Details

### Ship-on-Time (35% weight)
- **Formula**: `(totalPOs - latePOs) / totalPOs × 100`
- **Grace period**: 10 days — deliveries less than 10 days late count as on-time
- **RAG**: Green ≥94% | Amber ≥85% | Red <85%
- **Output**: Percentage + histogram of late-day distribution

### Quality (25% weight)
- **Formula**: `PPM = (manufacturer_defect_units / total_shipped) × 1,000,000`
- **Normalized**: `100 - min(100, PPM / 100)` (higher = better)
- **Classification**: AI-assisted categorization of return reasons (manufacturer_defect, damage_in_transit, customer_preference, etc.)
- **RAG**: Green ≤1000 PPM | Amber ≤5000 PPM | Red >5000 PPM

### Pricing (20% weight)
- **Formula**: `delta = supplier_weighted_YoY% - regional_PPI%`
- **Benchmark**: Uses FRED PPI data as the inflation baseline
- **RAG**: Green ≤0 (beating market) | Amber ≤+2pp | Red >+2pp
- **Guard**: Suppliers with <$50K spend or <3 SKUs get "insufficient data" flag

### Communication (20% weight)
- **Formula**: `0.70 × EoDB_avg + 0.30 × Innovation_avg` (survey scores 1–10)
- **Descriptors**: Strong ≥8.5 | Solid ≥7.0 | Developing ≥5.5 | Needs Improvement <5.5
- **RAG**: Green (Strong) | Amber (Solid/Developing) | Red (Needs Improvement)

## Tier Classification

| Tier | Criteria |
|------|----------|
| **Strategic** | Composite ≥90, zero red pillars |
| **Preferred** | Composite ≥80, zero red pillars |
| **Approved** | Composite ≥65, or exactly 1 red pillar |
| **Conditional** | Composite <65, or 2+ red pillars |

**Red-flag override**: Any supplier with 2+ red pillars is automatically Conditional regardless of composite score. This is a deliberate business rule — a supplier can't average their way out of multiple critical failures. A 95 composite with two red pillars still means "we need to talk."

## Quality & Correctness

The scoring engine is validated with **property-based testing** (fast-check). Rather than testing individual examples, these properties must hold for *every possible input*:

| Property | Business Rule It Enforces |
|----------|--------------------------|
| SOT score always in [0, 100] | No impossible percentages shown to stakeholders |
| PPM normalization is monotonically decreasing | Fewer defects always = better score (no inversions) |
| Composite always in [0, 100] | Score is always interpretable |
| Tier is monotonically non-decreasing with composite | Higher score never produces a worse tier (holding RAG constant) |
| **2+ red pillars → Conditional always** | Multiple critical failures can't be averaged away |
| Survey average always in [1, 10] | Output stays within input domain |

These aren't just engineering tests — they're the mathematical guarantees that make the scoring defensible when a supplier challenges their tier classification.

## External Output Mode

In real supplier management, you need two versions of the scorecard: one for internal decision-making and one you can hand to the supplier during a quarterly business review. Giving a supplier their network comparison data or your internal composite score creates leverage problems. Showing them their raw communication survey scores poisons the next survey.

The tool handles this with an `outputMode` context that controls data visibility across every component:

- **Internal mode**: Full composite scores, network comparison rankings, due-date change analytics, raw communication numbers, and competitive benchmarks
- **External mode**: Pillar-level RAG status, trend direction, late-orders histogram, and methodology — everything a supplier needs to understand their performance without seeing your negotiating data

External PDFs are generated via Puppeteer rendering the same React components with `?output=external`. Same data model, same source of truth, different visibility — so internal and external can never drift out of sync.

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/supplier-scorecard.git
cd supplier-scorecard
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Project Structure

```
supplier-scorecard/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   └── scoring/
│   │       ├── sot.ts              # Ship-on-Time scoring
│   │       ├── quality.ts          # Quality/PPM scoring
│   │       ├── pricing.ts          # Pricing vs PPI scoring
│   │       ├── communication.ts    # Survey scoring
│   │       ├── composite.ts        # Weighted composite
│   │       └── tier.ts             # Tier classification
│   ├── services/
│   │   ├── csvIngestion.ts         # CSV parsing + validation
│   │   └── fredService.ts          # FRED API for PPI benchmarks
│   ├── stores/
│   │   └── suppliersStore.ts       # Zustand state management
│   ├── pages/
│   │   ├── SupplierBrowserPage.tsx  # Filterable supplier table
│   │   └── Supplier360Page.tsx      # Single-supplier deep dive
│   ├── components/
│   │   ├── PillarTile.tsx
│   │   ├── TierBadge.tsx
│   │   ├── RAGBadge.tsx
│   │   ├── TrendChart.tsx
│   │   └── LateOrdersHistogram.tsx
│   └── data/
│       ├── schema.ts              # TypeScript interfaces
│       ├── config.ts              # Thresholds, weights
│       └── mockSuppliers.json     # Synthetic demo data
└── tests/
    └── lib/scoring/
        ├── sot.test.ts
        ├── quality.test.ts
        ├── pricing.test.ts
        ├── communication.test.ts
        └── tier.test.ts
```

## Tech Stack

- **React 19** + **TypeScript** — type-safe UI with compile-time validation of the scoring model
- **Vite** — fast dev server and build
- **Tailwind CSS** — utility-first styling (dark theme, Satoshi + JetBrains Mono fonts)
- **Zustand** — lightweight state management (separate stores per domain)
- **TanStack Table** — headless sortable/filterable tables with saved filter presets
- **Recharts** — sparklines, trend charts, histograms, heatmaps
- **Vitest** + **fast-check** — unit + property-based testing
- **Puppeteer** — PDF generation (renders React components server-side)
- **FRED API** — public inflation benchmarks (free API key)

## License

MIT
