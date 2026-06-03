# FutureProof

Supply chain analytics tools — predictive risk scoring, cost modeling, supplier performance, and trade compliance.

## Projects

| Project | What It Does | Stack |
|---------|--------------|-------|
| [**supply-chain-risk-scoring**](supply-chain-risk-scoring/) | Predicts which POs will miss their ship date before any carrier signal exists | Python · LightGBM · Streamlit |
| [**should-cost-model**](should-cost-model/) | BOM-level cost models driven by public commodity indices (FRED API) | Vanilla JS · FRED API |
| [**supplier-scorecard**](supplier-scorecard/) | 4-pillar supplier performance scoring with tier classification and external PDFs | React 19 · TypeScript · Vite |
| [**tariff-landed-cost**](tariff-landed-cost/) | Full landed cost calculator with HTS lookup and tariff scenario modeling | Vanilla JS · HTML |

## Portfolio Notes

These tools span different technology choices deliberately:

- **Python + ML** (risk scoring) — when the problem is predictive modeling with a trained classifier, calibration pipeline, and statistical validation gate
- **Vanilla JS** (should-cost, tariff) — when the problem is a lightweight, no-build-step analyst tool that runs on any machine without installation. Opens in a browser, works offline, deploys to a network share
- **React + TypeScript** (scorecard) — when the problem is a complex multi-page application with state management, headless tables, conditional rendering modes, and PDF generation

The choice isn't "which framework do I know" — it's "what does this problem need." A tariff calculator that requires `npm install` and a build step is over-engineered. A multi-pillar scorecard with output mode switching that lives in one HTML file is under-engineered.

## Common Themes

Across all four tools:
- **Business problem first** — each README leads with what the tool does for a sourcing team, not the tech stack
- **Public data only** — FRED API (free), synthetic/dummy data, no proprietary information
- **Methodology is the product** — the algorithms, scoring models, and calibration approaches are what matter; the UI is how you deliver them
- **Production-minded** — confidence indicators, data quality guards, append-only audit trails, validation gates

## Author

Supply chain analytics and predictive tools for procurement, sourcing, and operations teams.
