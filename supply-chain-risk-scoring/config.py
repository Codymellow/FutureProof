"""Configuration — thresholds, feature flags, paths."""
from pathlib import Path

# ── Paths ──
DATA_DIR = Path(__file__).parent / "data"
DB_PATH = Path(__file__).parent / "risk_scoring.db"

# ── Model thresholds ──
ECE_THRESHOLD = 0.05
LATE_GRACE_DAYS = 10
CONFIDENCE_HIGH_DEPTH = 100
CONFIDENCE_HIGH_RECENCY_DAYS = 90
BACKTEST_TRAIN_SPLIT = 0.70

# ── Risk tier thresholds ──
TIER_HIGH = 0.60
TIER_MEDIUM = 0.35
