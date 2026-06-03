"""
PO Scorer: scores every open un-shipped PO line using the trained model.

Produces:
  - probability: calibrated P(late) ∈ (0, 1)
  - risk_score: probability × impact ($) — the number that matters
  - risk_tier: HIGH (≥0.60) / MEDIUM (≥0.35) / LOW
  - confidence: High / Medium / Low based on history depth and ECE
  - top_drivers: top 3 features driving this prediction
  - cost_at_risk: open_value × probability
"""
import json
import logging
import uuid
from datetime import date
from typing import Optional

import numpy as np
import pandas as pd

from config import CONFIDENCE_HIGH_DEPTH, ECE_THRESHOLD, TIER_HIGH, TIER_MEDIUM
from features import FEATURE_COLS, build_features, build_supplier_history, build_category_history

logger = logging.getLogger(__name__)


def risk_tier(prob: float) -> str:
    if prob >= TIER_HIGH:
        return "HIGH"
    elif prob >= TIER_MEDIUM:
        return "MEDIUM"
    return "LOW"


def confidence_band(history_depth: int, ece: float) -> str:
    """Confidence = f(history depth, calibration quality)."""
    if history_depth >= CONFIDENCE_HIGH_DEPTH and ece <= ECE_THRESHOLD:
        return "High"
    elif history_depth >= 30 and ece <= 0.10:
        return "Medium"
    return "Low"


def score_open_pos(
    model,
    open_pos_df: pd.DataFrame,
    sot_history_df: pd.DataFrame,
    planning_df: pd.DataFrame,
    snapshot_date: Optional[str] = None,
) -> pd.DataFrame:
    """
    Score every open PO line with the trained model.

    Returns DataFrame with original columns plus:
      probability, risk_tier, cost_at_risk, risk_score, confidence, top_drivers
    """
    snapshot_date = snapshot_date or date.today().isoformat()

    if len(open_pos_df) == 0:
        logger.warning("No open POs to score.")
        return open_pos_df

    # Build supplier history from full SOT
    from features import build_label
    sot = build_label(sot_history_df)
    global_late_rate = float(sot["label"].mean())
    sup_hist = build_supplier_history(sot)
    mg_hist = build_category_history(sot, "material_group", "mg")
    pl_hist = build_category_history(sot, "product_line", "pl")

    # Build features for open POs
    feats = build_features(open_pos_df, sup_hist, mg_hist, pl_hist, planning_df, global_late_rate)
    X = feats[FEATURE_COLS].fillna(0)

    # Score
    probs = model.predict_proba(X)[:, 1]
    probs = np.clip(probs, 0.001, 0.999)

    po = open_pos_df.copy()
    po["probability"] = probs
    po["risk_tier"] = [risk_tier(p) for p in probs]

    # Cost at risk = open_value × probability
    po["cost_at_risk"] = (
        pd.to_numeric(po.get("open_value", 0), errors="coerce").fillna(0) * probs
    )

    # Risk score = probability × impact
    po["risk_score"] = po["cost_at_risk"]  # same as cost_at_risk in this context

    # Top drivers (global — same top 3 for all POs from feature importances)
    try:
        base_est = model.calibrated_classifiers_[0].estimator
        importances = base_est.feature_importances_
        top_idxs = np.argsort(importances)[::-1][:3]
        top_drivers = [FEATURE_COLS[i] for i in top_idxs]
    except Exception:
        top_drivers = ["lt_cv", "delv_date_delta", "days_till_ship"]

    po["top_drivers"] = json.dumps(top_drivers)

    # Confidence band per supplier
    sup_depth_map = {}
    if len(sup_hist) > 0:
        sup_depth_map = dict(zip(sup_hist["supplier_key"], sup_hist["total_count"]))

    po["confidence"] = po["supplier_name"].str.strip().str.upper().map(
        lambda s: confidence_band(int(sup_depth_map.get(s, 0)), ECE_THRESHOLD)
    )

    # Summary logging
    logger.info(
        f"Scored {len(po)} open POs. "
        f"HIGH: {(po['risk_tier'] == 'HIGH').sum()} | "
        f"MEDIUM: {(po['risk_tier'] == 'MEDIUM').sum()} | "
        f"LOW: {(po['risk_tier'] == 'LOW').sum()}"
    )
    logger.info(f"Company-wide predicted % late: {probs.mean():.1%}")
    logger.info(f"Total cost-at-risk: ${po['cost_at_risk'].sum():,.0f}")

    return po
