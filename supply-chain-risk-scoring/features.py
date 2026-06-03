"""
Feature engineering pipeline for the PO lateness risk model.

Builds a 25-feature vector from three data sources:
  1. Supplier history (SOT data) — behavioral patterns
  2. Current PO state (open PO extract) — real-time signals
  3. Inventory consequence (planning data join) — downstream impact

Key design principles:
  - Strict as-of: all features computed from training-window history only
  - No post-shipment leakage: actual ship dates, carrier data excluded
  - Missing values handled explicitly (not silently zeroed)
"""
import logging

import numpy as np
import pandas as pd

from config import LATE_GRACE_DAYS

logger = logging.getLogger(__name__)

# Canonical feature list — all numeric, strictly pre-shipment
FEATURE_COLS = [
    # ── Supplier history ──
    "otif_rate",
    "base_rate_late",
    "lt_cv",
    "lt_ratio_mean",
    "lt_mean",
    "lt_std",
    # ── Current PO state ──
    "days_po",
    "delv_date_delta",
    "days_till_ship",
    "transit_delta",
    "confirm_lag",
    "already_late_flag",
    # ── Inventory consequence ──
    "sku_safety_stock_gap",
    "sku_days_supply",
    "sku_moi",
    "sku_shortage_encoded",
    "sku_periods_until_red",
    "sku_plan_maturity",
    "if_late_breach",
    # ── Category signals ──
    "mg_late_rate",
    "pl_late_rate",
    # ── Order characteristics ──
    "po_qty_log",
    "order_value_log",
    "po_month",
    "dc_code",
]


def build_label(df: pd.DataFrame) -> pd.DataFrame:
    """
    Label: is_late = (actual_ship - original_ship > LATE_GRACE_DAYS).
    POs arriving 1-9 days late are NOT considered operationally late.
    """
    df = df.copy()
    df["original_ship_date"] = pd.to_datetime(df["original_ship_date"], errors="coerce")
    df["actual_ship_date"] = pd.to_datetime(df["actual_ship_date"], errors="coerce")

    delta = (df["actual_ship_date"] - df["original_ship_date"]).dt.days
    df["lateness_days"] = delta
    df["label"] = (delta > LATE_GRACE_DAYS).astype(int)
    return df


def build_supplier_history(train_df: pd.DataFrame) -> pd.DataFrame:
    """
    Per-supplier historical features from training window only.
    Prevents leakage by never using test-period data.
    """
    df = train_df.copy()
    df["supplier_key"] = df["supplier_name"].str.strip().str.upper()

    # Lead time ratio: actual / planned
    valid_lt = df["planned_lead_time_days"] > 0
    df.loc[valid_lt, "lt_ratio"] = (
        df.loc[valid_lt, "actual_lead_time_days"] / df.loc[valid_lt, "planned_lead_time_days"]
    )

    agg = df.groupby("supplier_key").agg(
        total_count=("label", "count"),
        late_count=("label", "sum"),
        lt_mean=("actual_lead_time_days", "mean"),
        lt_std=("actual_lead_time_days", "std"),
        lt_planned_mean=("planned_lead_time_days", "mean"),
        lt_ratio_mean=("lt_ratio", "mean"),
        lt_ratio_std=("lt_ratio", "std"),
    ).reset_index()

    agg["otif_rate"] = 1.0 - (agg["late_count"] / agg["total_count"].clip(lower=1))
    agg["base_rate_late"] = agg["late_count"] / agg["total_count"].clip(lower=1)
    agg["lt_cv"] = agg["lt_std"] / agg["lt_mean"].replace(0, np.nan)

    return agg


def build_category_history(train_df: pd.DataFrame, col: str, prefix: str) -> pd.DataFrame:
    """Build late rate by category (material group or product line)."""
    if col not in train_df.columns:
        return pd.DataFrame()
    agg = train_df.groupby(col).agg(
        total=("label", "count"),
        late=("label", "sum"),
    ).reset_index()
    agg[f"{prefix}_late_rate"] = agg["late"] / agg["total"].clip(lower=1)
    return agg


def build_features(
    df: pd.DataFrame,
    supplier_hist: pd.DataFrame,
    mg_hist: pd.DataFrame,
    pl_hist: pd.DataFrame,
    planning_df: pd.DataFrame,
    global_late_rate: float,
) -> pd.DataFrame:
    """
    Build the full feature vector for each row.
    All features are strictly pre-shipment (no post-shipment leakage).
    """
    out = df.copy()
    out["supplier_key"] = out["supplier_name"].str.strip().str.upper()

    # ── Join supplier history ──
    if len(supplier_hist) > 0:
        out = out.merge(
            supplier_hist[["supplier_key", "otif_rate", "base_rate_late", "lt_cv",
                           "lt_mean", "lt_std", "lt_ratio_mean", "lt_planned_mean", "total_count"]],
            on="supplier_key", how="left"
        )
    else:
        for col in ["otif_rate", "base_rate_late", "lt_cv", "lt_mean", "lt_std",
                    "lt_ratio_mean", "lt_planned_mean", "total_count"]:
            out[col] = np.nan

    out["otif_rate"] = out["otif_rate"].fillna(1.0 - global_late_rate)
    out["base_rate_late"] = out["base_rate_late"].fillna(global_late_rate)
    out["lt_cv"] = out["lt_cv"].fillna(0.0)
    out["lt_ratio_mean"] = out["lt_ratio_mean"].fillna(1.0)

    # ── Join material group history ──
    if len(mg_hist) > 0 and "material_group" in out.columns:
        out = out.merge(mg_hist[["material_group", "mg_late_rate"]], on="material_group", how="left")
    else:
        out["mg_late_rate"] = global_late_rate
    out["mg_late_rate"] = out["mg_late_rate"].fillna(global_late_rate)

    # ── Join product line history ──
    if len(pl_hist) > 0 and "product_line" in out.columns:
        out = out.merge(pl_hist[["product_line", "pl_late_rate"]], on="product_line", how="left")
    else:
        out["pl_late_rate"] = global_late_rate
    out["pl_late_rate"] = out["pl_late_rate"].fillna(global_late_rate)

    # ── Planning data join (inventory consequence) ──
    if planning_df is not None and len(planning_df) > 0 and "sku" in out.columns:
        plan = planning_df.copy()
        plan["sku_safety_stock_gap"] = plan["net_inventory"] - plan["safety_stock_target"]
        plan["sku_days_supply"] = plan["days_of_supply"].fillna(90)
        plan["sku_moi"] = plan["moi_months"].fillna(-1)
        plan["sku_plan_maturity"] = (
            plan["firm_production"] /
            (plan["firm_production"] + plan["planned_production"]).replace(0, np.nan)
        ).fillna(0.5)

        # Shortage status encoding: red=2, amber=1, green=0
        def _encode_status(row):
            ni, ss = row["net_inventory"], row["safety_stock_target"]
            if ni < 0 or (ni < ss and row.get("total_demand", 0) > 0):
                return 2  # red
            elif ni < ss * 1.25:
                return 1  # amber
            return 0  # green

        plan["sku_shortage_encoded"] = plan.apply(_encode_status, axis=1)
        plan["sku_periods_until_red"] = plan["sku_shortage_encoded"].apply(
            lambda x: 0 if x == 2 else 12  # simplified: 0 if already red, else 12
        )

        plan_cols = ["sku", "sku_safety_stock_gap", "sku_days_supply", "sku_moi",
                     "sku_shortage_encoded", "sku_periods_until_red", "sku_plan_maturity"]
        out = out.merge(plan[plan_cols], on="sku", how="left")
    else:
        out["sku_safety_stock_gap"] = 0.0
        out["sku_days_supply"] = 90.0
        out["sku_moi"] = -1.0
        out["sku_shortage_encoded"] = -1.0
        out["sku_periods_until_red"] = 12.0
        out["sku_plan_maturity"] = 0.5

    # Fill missing planning features
    out["sku_safety_stock_gap"] = out["sku_safety_stock_gap"].fillna(0)
    out["sku_days_supply"] = out["sku_days_supply"].fillna(90).clip(-999, 999)
    out["sku_moi"] = out["sku_moi"].fillna(-1)
    out["sku_shortage_encoded"] = out["sku_shortage_encoded"].fillna(-1)
    out["sku_periods_until_red"] = out["sku_periods_until_red"].fillna(12)
    out["sku_plan_maturity"] = out["sku_plan_maturity"].fillna(0.5)

    # ── if_late_breach: would delaying this PO push inventory below safety stock? ──
    if "delv_date_delta" in out.columns:
        daily_demand = out.get("sku_days_supply", pd.Series(90.0, index=out.index))
        # Approximate: if safety stock gap is already negative and PO is slipping, breach = 1
        out["if_late_breach"] = (
            (out["sku_safety_stock_gap"] < 0) & (out["delv_date_delta"] > 0)
        ).astype(int)
    else:
        out["if_late_breach"] = 0

    # ── Current PO features ──
    out["days_po"] = pd.to_numeric(out.get("planned_lead_time_days", 60), errors="coerce").fillna(60)
    out["delv_date_delta"] = pd.to_numeric(out.get("delv_date_delta", 0), errors="coerce").fillna(0)
    out["days_till_ship"] = pd.to_numeric(out.get("days_till_ship", 30), errors="coerce").fillna(30)
    out["transit_delta"] = pd.to_numeric(out.get("transit_delta", 0), errors="coerce").fillna(0)
    out["confirm_lag"] = pd.to_numeric(out.get("confirm_lag_days", 14), errors="coerce").fillna(14)
    out["already_late_flag"] = pd.to_numeric(out.get("erp_late_flag", 0), errors="coerce").fillna(0).astype(int)

    # ── Order characteristics ──
    out["po_qty_log"] = np.log1p(pd.to_numeric(out.get("order_qty", 0), errors="coerce").fillna(0).clip(lower=0))
    out["order_value_log"] = np.log1p(pd.to_numeric(out.get("order_value", out.get("open_value", 0)), errors="coerce").fillna(0).abs().clip(lower=0))
    out["po_month"] = pd.to_datetime(out.get("po_date"), errors="coerce").dt.month.fillna(6).astype(int)
    out["dc_code"] = pd.Categorical(out.get("distribution_center", "UNKNOWN").fillna("UNKNOWN")).codes

    return out
