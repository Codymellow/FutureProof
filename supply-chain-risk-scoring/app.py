"""
Streamlit dashboard for the Supply Chain Risk Scoring Engine.

Tabs:
  1. Backtest Results — model performance, gate status, feature importances
  2. Supplier Risk Heatmap — scored open POs aggregated by supplier
  3. PO-Level Detail — drill into individual high-risk PO lines
  4. Company Rollup — executive summary of predicted % late and cost-at-risk
"""
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go

from pathlib import Path
from config import DATA_DIR

st.set_page_config(page_title="Supply Chain Risk Scoring", layout="wide", page_icon="⚠️")

st.title("⚠️ Supply Chain Risk Scoring Engine")
st.caption("Predicts PO lateness before any carrier signal exists")


@st.cache_data
def load_and_score():
    """Load data, run backtest, and score open POs."""
    from backtest import run_backtest
    from scorer import score_open_pos

    # Run backtest
    result = run_backtest()

    # Score open POs with trained model
    open_pos = pd.read_csv(DATA_DIR / "open_pos.csv")
    sot = pd.read_csv(DATA_DIR / "sot_history.csv")
    planning = pd.read_csv(DATA_DIR / "planning_data.csv")

    scored = score_open_pos(result.model, open_pos, sot, planning)
    return result, scored


# ── Load data ──
try:
    backtest_result, scored_pos = load_and_score()
except FileNotFoundError:
    st.error("Data files not found. Run `python generate_data.py` first.")
    st.stop()

# ── Tabs ──
tab1, tab2, tab3, tab4 = st.tabs([
    "📊 Backtest Results", "🔥 Supplier Risk Map",
    "📋 PO Detail", "🏢 Company Rollup"
])

# ── Tab 1: Backtest ──
with tab1:
    gate = backtest_result.gate
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("PR-AUC (Model)", f"{backtest_result.pr_auc:.4f}")
    col2.metric("PR-AUC (Baseline)", f"{backtest_result.baseline_pr_auc:.4f}")
    col3.metric("ECE", f"{backtest_result.ece:.4f}")
    col4.metric("Gate", "✓ PASSED" if gate.passed else "✗ FAILED")

    st.subheader("Top Feature Importances")
    feat_df = pd.DataFrame(backtest_result.top_features, columns=["Feature", "Importance"])
    fig = px.bar(feat_df, x="Importance", y="Feature", orientation="h",
                 color_discrete_sequence=["#2563eb"])
    fig.update_layout(yaxis=dict(autorange="reversed"), height=300)
    st.plotly_chart(fig, use_container_width=True)

    with st.expander("Gate Details"):
        st.json({
            "passed": gate.passed,
            "pr_auc_model": round(gate.pr_auc_model, 4),
            "pr_auc_baseline": round(gate.pr_auc_baseline, 4),
            "ece": round(gate.ece, 4),
            "company_pct_model": f"{gate.company_pct_late_model:.1%}",
            "company_pct_actual": f"{gate.company_pct_late_actual:.1%}",
            "deviation_pp": round(gate.company_pct_deviation, 2),
            "failure_reason": gate.failure_reason,
        })

# ── Tab 2: Supplier Heatmap ──
with tab2:
    supplier_agg = scored_pos.groupby("supplier_name").agg(
        total_pos=("po_number", "count"),
        high_risk=("risk_tier", lambda x: (x == "HIGH").sum()),
        medium_risk=("risk_tier", lambda x: (x == "MEDIUM").sum()),
        avg_probability=("probability", "mean"),
        total_cost_at_risk=("cost_at_risk", "sum"),
    ).reset_index().sort_values("total_cost_at_risk", ascending=False)

    st.subheader("Supplier Risk Summary")
    st.dataframe(
        supplier_agg.style.format({
            "avg_probability": "{:.1%}",
            "total_cost_at_risk": "${:,.0f}",
        }),
        use_container_width=True,
        hide_index=True,
    )

    # Treemap
    fig = px.treemap(
        supplier_agg, path=["supplier_name"], values="total_cost_at_risk",
        color="avg_probability", color_continuous_scale="RdYlGn_r",
        title="Cost-at-Risk by Supplier"
    )
    st.plotly_chart(fig, use_container_width=True)

# ── Tab 3: PO Detail ──
with tab3:
    st.subheader("High-Risk PO Lines")

    tier_filter = st.multiselect("Risk Tier", ["HIGH", "MEDIUM", "LOW"], default=["HIGH", "MEDIUM"])
    filtered = scored_pos[scored_pos["risk_tier"].isin(tier_filter)].sort_values("probability", ascending=False)

    display_cols = ["po_number", "supplier_name", "sku", "probability", "risk_tier",
                    "cost_at_risk", "confidence", "days_till_ship", "delv_date_delta"]
    st.dataframe(
        filtered[display_cols].head(50).style.format({
            "probability": "{:.1%}",
            "cost_at_risk": "${:,.0f}",
        }),
        use_container_width=True,
        hide_index=True,
    )

# ── Tab 4: Company Rollup ──
with tab4:
    st.subheader("Executive Summary")

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Open POs", f"{len(scored_pos):,}")
    col2.metric("Predicted % Late", f"{scored_pos['probability'].mean():.1%}")
    col3.metric("HIGH Risk POs", f"{(scored_pos['risk_tier'] == 'HIGH').sum()}")
    col4.metric("Total Cost-at-Risk", f"${scored_pos['cost_at_risk'].sum():,.0f}")

    # Distribution
    fig = px.histogram(scored_pos, x="probability", nbins=30,
                       title="Distribution of Lateness Probability",
                       color_discrete_sequence=["#2563eb"])
    fig.add_vline(x=0.60, line_dash="dash", line_color="red", annotation_text="HIGH threshold")
    fig.add_vline(x=0.35, line_dash="dash", line_color="orange", annotation_text="MEDIUM threshold")
    st.plotly_chart(fig, use_container_width=True)

    # By region
    region_agg = scored_pos.groupby("supplier_region").agg(
        count=("po_number", "count"),
        avg_prob=("probability", "mean"),
        cost_at_risk=("cost_at_risk", "sum"),
    ).reset_index().sort_values("cost_at_risk", ascending=False)

    fig = px.bar(region_agg, x="supplier_region", y="cost_at_risk",
                 color="avg_prob", color_continuous_scale="RdYlGn_r",
                 title="Cost-at-Risk by Supplier Region")
    st.plotly_chart(fig, use_container_width=True)
