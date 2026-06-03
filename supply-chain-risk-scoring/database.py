"""
SQLite repository for risk events and prediction ledger.

Design:
  - All snapshot tables are append-only (rows never updated or deleted)
  - Prediction ledger tracks every prediction for Brier score backtesting
  - Risk events carry probability × impact = risk_score (always)
"""
import sqlite3
import logging
from pathlib import Path
from contextlib import contextmanager

from config import DB_PATH

logger = logging.getLogger(__name__)

DDL = """
CREATE TABLE IF NOT EXISTS risk_events (
    id               TEXT PRIMARY KEY,
    category         TEXT NOT NULL,
    probability      REAL NOT NULL,
    impact           REAL,
    risk_score       REAL NOT NULL,
    confidence       TEXT,
    source           TEXT,
    created_date     TEXT NOT NULL,
    entity_ref       TEXT,
    cost_at_risk     REAL,
    top_drivers      TEXT,
    status           TEXT DEFAULT 'New',
    owner            TEXT,
    due_date         TEXT,
    resolved_date    TEXT
);

CREATE TABLE IF NOT EXISTS prediction_ledger (
    prediction_id        TEXT PRIMARY KEY,
    po_line_ref          TEXT NOT NULL,
    predicted_probability REAL NOT NULL,
    confidence           TEXT,
    prediction_date      TEXT NOT NULL,
    outcome_date         TEXT,
    actual_outcome       INTEGER,
    hit                  INTEGER,
    brier_component      REAL
);

CREATE TABLE IF NOT EXISTS supplier_snapshot (
    supplier_key     TEXT NOT NULL,
    snapshot_date    TEXT NOT NULL,
    supplier_name    TEXT,
    region           TEXT,
    otif_rate        REAL,
    lt_mean_days     REAL,
    lt_cv            REAL,
    total_count      INTEGER,
    late_count       INTEGER,
    PRIMARY KEY (supplier_key, snapshot_date)
);
"""


class RiskDatabase:
    """Append-only SQLite repository for risk scoring output."""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript(DDL)
            conn.commit()
        logger.info(f"Database ready at {self.db_path}")

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        try:
            yield conn
        finally:
            conn.close()

    def insert_risk_events(self, events: list[tuple]):
        with self._conn() as conn:
            conn.executemany("""
                INSERT OR IGNORE INTO risk_events
                    (id, category, probability, impact, risk_score, confidence,
                     source, created_date, entity_ref, cost_at_risk, top_drivers)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, events)
            conn.commit()

    def insert_predictions(self, predictions: list[tuple]):
        with self._conn() as conn:
            conn.executemany("""
                INSERT OR IGNORE INTO prediction_ledger
                    (prediction_id, po_line_ref, predicted_probability, confidence,
                     prediction_date, outcome_date, actual_outcome, hit, brier_component)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, predictions)
            conn.commit()

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
