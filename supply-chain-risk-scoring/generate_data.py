"""
Generate realistic synthetic supply chain data for the risk scoring engine.

Creates:
  - data/sot_history.csv    — 18 months of shipment-on-time records
  - data/open_pos.csv       — Currently open PO lines
  - data/planning_data.csv  — SKU-level inventory planning (net inventory, safety stock)

All supplier names, SKUs, and amounts are synthetic. No proprietary data.
"""
import os
import random
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

fake = Faker()
Faker.seed(42)
random.seed(42)
np.random.seed(42)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# ── Supplier profiles (synthetic) ──
SUPPLIERS = [
    {"name": "Apex Manufacturing Co.", "region": "CN", "otif_base": 0.82, "lt_mean": 45, "lt_std": 12},
    {"name": "Pacific Components Ltd.", "region": "VN", "otif_base": 0.91, "lt_mean": 35, "lt_std": 6},
    {"name": "Rhine Industrial GmbH", "region": "DE", "otif_base": 0.96, "lt_mean": 28, "lt_std": 3},
    {"name": "Coastal Precision Inc.", "region": "US", "otif_base": 0.94, "lt_mean": 14, "lt_std": 4},
    {"name": "Siam Electronics Corp.", "region": "TH", "otif_base": 0.87, "lt_mean": 40, "lt_std": 9},
    {"name": "Borneo Assembly Works", "region": "ID", "otif_base": 0.78, "lt_mean": 50, "lt_std": 15},
    {"name": "Maple Ridge Fabrication", "region": "CA", "otif_base": 0.93, "lt_mean": 18, "lt_std": 5},
    {"name": "Shenzhen QuickTech", "region": "CN", "otif_base": 0.85, "lt_mean": 38, "lt_std": 10},
    {"name": "Mumbai Precision Parts", "region": "IN", "otif_base": 0.80, "lt_mean": 42, "lt_std": 14},
    {"name": "Seoul Dynamics Co.", "region": "KR", "otif_base": 0.92, "lt_mean": 22, "lt_std": 4},
    {"name": "Guadalajara Components", "region": "MX", "otif_base": 0.89, "lt_mean": 20, "lt_std": 7},
    {"name": "Baltic Metals OÜ", "region": "EE", "otif_base": 0.95, "lt_mean": 30, "lt_std": 4},
]

# ── Material groups ──
MATERIAL_GROUPS = ["MG-Electronics", "MG-Mechanical", "MG-Packaging", "MG-Raw Materials", "MG-Subassembly"]
PRODUCT_LINES = ["PL-Consumer", "PL-Industrial", "PL-Commercial", "PL-OEM"]
DISTRIBUTION_CENTERS = ["DC-West", "DC-East", "DC-Central", "DC-Europe"]


def generate_skus(n: int = 200) -> list[str]:
    """Generate n unique 10-digit SKU strings."""
    skus = set()
    while len(skus) < n:
        skus.add(str(random.randint(1000000, 9999999999)).zfill(10))
    return sorted(skus)


def generate_sot_history(skus: list[str], n_records: int = 8000) -> pd.DataFrame:
    """Generate historical shipment-on-time records."""
    records = []
    start_date = date.today() - timedelta(days=540)  # 18 months back

    for _ in range(n_records):
        supplier = random.choice(SUPPLIERS)
        sku = random.choice(skus)
        po_date = start_date + timedelta(days=random.randint(0, 500))
        planned_lt = max(7, int(np.random.normal(supplier["lt_mean"], supplier["lt_std"])))
        original_ship = po_date + timedelta(days=planned_lt)

        # Simulate actual ship date based on supplier reliability
        if random.random() < supplier["otif_base"]:
            # On time (within grace period)
            actual_delta = random.randint(-5, 9)
        else:
            # Late — exponential distribution of lateness
            actual_delta = int(10 + np.random.exponential(15))

        actual_ship = original_ship + timedelta(days=actual_delta)
        order_qty = random.choice([100, 250, 500, 1000, 2500, 5000])
        unit_cost = round(random.uniform(2.50, 250.00), 2)

        records.append({
            "po_number": f"PO-{random.randint(100000, 999999)}",
            "po_line": str(random.randint(1, 5)),
            "supplier_name": supplier["name"],
            "supplier_region": supplier["region"],
            "sku": sku,
            "material_group": random.choice(MATERIAL_GROUPS),
            "product_line": random.choice(PRODUCT_LINES),
            "distribution_center": random.choice(DISTRIBUTION_CENTERS),
            "po_date": po_date.isoformat(),
            "original_ship_date": original_ship.isoformat(),
            "actual_ship_date": actual_ship.isoformat(),
            "planned_lead_time_days": planned_lt,
            "actual_lead_time_days": (actual_ship - po_date).days,
            "order_qty": order_qty,
            "unit_cost": unit_cost,
            "order_value": round(order_qty * unit_cost, 2),
        })

    return pd.DataFrame(records).sort_values("po_date").reset_index(drop=True)


def generate_open_pos(skus: list[str], n_records: int = 400) -> pd.DataFrame:
    """Generate currently open (un-shipped) PO lines."""
    records = []
    today = date.today()

    for _ in range(n_records):
        supplier = random.choice(SUPPLIERS)
        sku = random.choice(skus[:100])  # concentrate on a subset
        po_date = today - timedelta(days=random.randint(10, 90))
        planned_lt = max(7, int(np.random.normal(supplier["lt_mean"], supplier["lt_std"])))
        original_ship = po_date + timedelta(days=planned_lt)

        # Simulate delivery date revisions (slippage)
        if random.random() < 0.3:
            delv_date_delta = random.randint(3, 30)
        elif random.random() < 0.1:
            delv_date_delta = random.randint(-5, -1)  # pulled in
        else:
            delv_date_delta = 0

        current_ship = original_ship + timedelta(days=delv_date_delta)
        days_till_ship = (current_ship - today).days

        # Confirmation lag
        confirm_lag = random.randint(1, 21) if random.random() > 0.1 else random.randint(22, 60)

        # Transit time
        orig_transit = random.randint(5, 45)
        transit_delta = random.choice([0, 0, 0, 2, 5, -2]) if random.random() < 0.2 else 0

        order_qty = random.choice([100, 250, 500, 1000, 2500])
        unit_cost = round(random.uniform(5.00, 200.00), 2)

        records.append({
            "po_number": f"PO-{random.randint(100000, 999999)}",
            "po_line": str(random.randint(1, 5)),
            "supplier_name": supplier["name"],
            "supplier_region": supplier["region"],
            "sku": sku,
            "material_group": random.choice(MATERIAL_GROUPS),
            "product_line": random.choice(PRODUCT_LINES),
            "distribution_center": random.choice(DISTRIBUTION_CENTERS),
            "po_date": po_date.isoformat(),
            "original_ship_date": original_ship.isoformat(),
            "current_ship_date": current_ship.isoformat(),
            "planned_lead_time_days": planned_lt,
            "days_till_ship": days_till_ship,
            "delv_date_delta": delv_date_delta,
            "confirm_lag_days": confirm_lag,
            "original_transit_days": orig_transit,
            "transit_delta": transit_delta,
            "order_qty": order_qty,
            "unit_cost": unit_cost,
            "open_value": round(order_qty * unit_cost, 2),
            "erp_late_flag": 1 if days_till_ship < -5 else 0,
        })

    return pd.DataFrame(records).sort_values("po_date").reset_index(drop=True)


def generate_planning_data(skus: list[str]) -> pd.DataFrame:
    """Generate SKU-level planning data (inventory positions)."""
    records = []
    for sku in skus[:100]:
        safety_stock = random.randint(50, 2000)
        net_inventory = int(np.random.normal(safety_stock * 1.2, safety_stock * 0.5))
        total_demand = random.randint(100, 3000)
        firm_production = random.randint(0, total_demand)
        planned_production = total_demand - firm_production

        records.append({
            "sku": sku,
            "net_inventory": net_inventory,
            "safety_stock_target": safety_stock,
            "total_demand": total_demand,
            "firm_production": firm_production,
            "planned_production": planned_production,
            "moi_months": round(net_inventory / max(total_demand / 12, 1), 1) if total_demand > 0 else None,
            "days_of_supply": round(net_inventory / max(total_demand / 30, 1), 0) if total_demand > 0 else None,
        })

    return pd.DataFrame(records)


if __name__ == "__main__":
    print("Generating synthetic supply chain data...")

    skus = generate_skus(200)

    sot = generate_sot_history(skus, n_records=8000)
    sot.to_csv(DATA_DIR / "sot_history.csv", index=False)
    print(f"  SOT history: {len(sot):,} records → data/sot_history.csv")

    open_pos = generate_open_pos(skus, n_records=400)
    open_pos.to_csv(DATA_DIR / "open_pos.csv", index=False)
    print(f"  Open POs: {len(open_pos):,} records → data/open_pos.csv")

    planning = generate_planning_data(skus)
    planning.to_csv(DATA_DIR / "planning_data.csv", index=False)
    print(f"  Planning data: {len(planning):,} SKUs → data/planning_data.csv")

    print("\nDone. Run `python backtest.py` to train and evaluate the model.")
