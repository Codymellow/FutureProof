"""
Backtest harness: time-ordered train/test split, model training, calibration, and gate evaluation.

Key design:
  - Time-ordered 70/30 split — no shuffling (prevents temporal leakage)
  - LightGBM with isotonic calibration via CalibratedClassifierCV
  - Go/no-go gate: PR-AUC > baseline, ECE ≤ 0.05, company-% ±3pp
  - Base-rate baseline: P(late) = 1 - supplier_OTIF (what you'd predict with no model)
"""
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import average_precision_score

import lightgbm as lgb

from config import (
    BACKTEST_TRAIN_SPLIT,
    CONFIDENCE_HIGH_DEPTH,
    ECE_THRESHOLD,
    DATA_DIR,
)
from features import (
    FEATURE_COLS,
    build_category_history,
    build_features,
    build_label,
    build_supplier_history,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class GateResult:
    passed: bool
    pr_auc_model: float
    pr_auc_baseline: float
    ece: float
    company_pct_late_model: float
    company_pct_late_actual: float
    company_pct_deviation: float
    failure_reason: Optional[str] = None


@dataclass
class BacktestResult:
    pr_auc: float
    recall: float
    ece: float
    baseline_pr_auc: float
    company_pct_late: float
    actual_pct_late: float
    n_train: int
    n_test: int
    gate: GateResult
    model: object = field(default=None, repr=False)
    top_features: list = field(default_factory=list)


def compute_ece(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> float:
    """
    Expected Calibration Error.
    Measures how well predicted probabilities match observed frequencies.
    ECE = Σ (|bin_size| / N) × |accuracy_in_bin - mean_confidence_in_bin|
    """
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(y_true)
    for lo, hi in zip(bin_edges[:-1], bin_edges[1:]):
        mask = (y_prob >= lo) & (y_prob < hi)
        if mask.sum() == 0:
            continue
        frac_pos = y_true[mask].mean()
        mean_conf = y_prob[mask].mean()
        ece += (mask.sum() / n) * abs(frac_pos - mean_conf)
    return float(ece)


def recall_at_threshold(y_true, y_prob, threshold=0.5) -> float:
    preds = (y_prob >= threshold).astype(int)
    tp = ((preds == 1) & (y_true == 1)).sum()
    fn = ((preds == 0) & (y_true == 1)).sum()
    return float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0


def evaluate_gate(
    pr_auc: float,
    baseline_pr_auc: float,
    ece: float,
    company_pct_model: float,
    company_pct_actual: float,
) -> GateResult:
    """
    Go/no-go gate. Conditions checked in order, short-circuit on first failure:
    1. PR-AUC > baseline
    2. ECE ≤ 0.05
    3. Company-% deviation ≤ 3pp
    """
    pct_deviation = abs(company_pct_model - company_pct_actual) * 100

    if pr_auc <= baseline_pr_auc:
        return GateResult(False, pr_auc, baseline_pr_auc, ece,
                          company_pct_model, company_pct_actual, pct_deviation,
                          f"PR-AUC {pr_auc:.4f} ≤ baseline {baseline_pr_auc:.4f}")

    if ece > ECE_THRESHOLD:
        return GateResult(False, pr_auc, baseline_pr_auc, ece,
                          company_pct_model, company_pct_actual, pct_deviation,
                          f"ECE {ece:.4f} > threshold {ECE_THRESHOLD}")

    if pct_deviation > 3.0:
        return GateResult(False, pr_auc, baseline_pr_auc, ece,
                          company_pct_model, company_pct_actual, pct_deviation,
                          f"Company-% deviation {pct_deviation:.2f}pp > 3pp")

    return GateResult(True, pr_auc, baseline_pr_auc, ece,
                      company_pct_model, company_pct_actual, pct_deviation)


def run_backtest(sot_path: Optional[Path] = None, planning_path: Optional[Path] = None) -> BacktestResult:
    """Full backtest pipeline."""
    sot_path = sot_path or DATA_DIR / "sot_history.csv"
    planning_path = planning_path or DATA_DIR / "planning_data.csv"

    logger.info("Loading data...")
    df = pd.read_csv(sot_path)
    planning_df = pd.read_csv(planning_path) if planning_path.exists() else pd.DataFrame()

    # Label
    df = build_label(df)
    df = df.dropna(subset=["actual_ship_date", "original_ship_date"])

    # Time-ordered split — NO shuffling
    df = df.sort_values("po_date").reset_index(drop=True)
    n_total = len(df)
    n_train = int(n_total * BACKTEST_TRAIN_SPLIT)
    train_df = df.iloc[:n_train].copy()
    test_df = df.iloc[n_train:].copy()

    logger.info(f"Split: {n_train:,} train / {len(test_df):,} test")

    # Build history from training window only
    global_late_rate = float(train_df["label"].mean())
    logger.info(f"Training late rate: {global_late_rate:.1%}")

    sup_hist = build_supplier_history(train_df)
    mg_hist = build_category_history(train_df, "material_group", "mg")
    pl_hist = build_category_history(train_df, "product_line", "pl")

    # Build features
    train_feats = build_features(train_df, sup_hist, mg_hist, pl_hist, planning_df, global_late_rate)
    test_feats = build_features(test_df, sup_hist, mg_hist, pl_hist, planning_df, global_late_rate)

    X_train = train_feats[FEATURE_COLS].fillna(0)
    X_test = test_feats[FEATURE_COLS].fillna(0)
    y_train = train_feats["label"].values
    y_test = test_feats["label"].values

    # Base-rate baseline: P(late) = 1 - OTIF at supplier grain
    baseline_probs = test_feats["base_rate_late"].fillna(global_late_rate).clip(0, 1).values
    baseline_pr_auc = average_precision_score(y_test, baseline_probs)
    logger.info(f"Baseline PR-AUC: {baseline_pr_auc:.4f}")

    # Train LightGBM + isotonic calibration
    logger.info("Training LightGBM with isotonic calibration...")
    base_model = lgb.LGBMClassifier(
        n_estimators=400,
        learning_rate=0.03,
        num_leaves=63,
        min_child_samples=20,
        class_weight="balanced",
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        verbose=-1,
    )
    model = CalibratedClassifierCV(base_model, method="isotonic", cv=3)
    model.fit(X_train, y_train)

    # Predict
    probs = model.predict_proba(X_test)[:, 1]

    # Metrics
    pr_auc = average_precision_score(y_test, probs)
    recall = recall_at_threshold(y_test, probs, 0.5)
    ece = compute_ece(y_test, probs)
    company_pct_late = float(probs.mean())
    actual_pct_late = float(y_test.mean())

    # Feature importances
    try:
        base_est = model.calibrated_classifiers_[0].estimator
        importances = dict(zip(FEATURE_COLS, base_est.feature_importances_))
    except Exception:
        importances = {f: 0 for f in FEATURE_COLS}
    top_features = sorted(importances.items(), key=lambda x: -x[1])[:5]

    # Gate evaluation
    gate = evaluate_gate(pr_auc, baseline_pr_auc, ece, company_pct_late, actual_pct_late)

    result = BacktestResult(
        pr_auc=pr_auc, recall=recall, ece=ece,
        baseline_pr_auc=baseline_pr_auc,
        company_pct_late=company_pct_late,
        actual_pct_late=actual_pct_late,
        n_train=n_train, n_test=len(test_df),
        gate=gate, model=model, top_features=top_features,
    )

    # Print report
    print("\n" + "=" * 60)
    print("BACKTEST REPORT")
    print("=" * 60)
    print(f"  Train rows:        {result.n_train:,}")
    print(f"  Test rows:         {result.n_test:,}")
    print(f"  PR-AUC (model):    {result.pr_auc:.4f}")
    print(f"  PR-AUC (baseline): {result.baseline_pr_auc:.4f}  {'✓ BEATS' if result.pr_auc > result.baseline_pr_auc else '✗ FAILS'}")
    print(f"  Recall @0.5:       {result.recall:.4f}")
    print(f"  ECE:               {result.ece:.4f}  {'✓ PASS' if result.ece <= ECE_THRESHOLD else '✗ FAIL'}")
    print(f"  Company % late:")
    print(f"    Model:           {result.company_pct_late:.1%}")
    print(f"    Actual:          {result.actual_pct_late:.1%}")
    print(f"    Deviation:       {gate.company_pct_deviation:.2f}pp  {'✓ PASS' if gate.company_pct_deviation <= 3.0 else '✗ FAIL'}")
    print(f"\n  Top features:")
    for name, imp in result.top_features:
        print(f"    {name:25s} {imp:.0f}")
    print(f"\n  {'✓ GATE PASSED' if gate.passed else f'✗ GATE FAILED: {gate.failure_reason}'}")
    print("=" * 60)

    return result


if __name__ == "__main__":
    run_backtest()
