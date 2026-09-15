#!/usr/bin/env python3
"""新しく取得したCSVを data/raw/nightlights_raw.csv に追記マージする。

手動でEarth EngineからCSVを取得したとき（バックフィル・トラブル時）に使う。
既存の data/raw/nightlights_raw.csv を読み込んだ上で、引数に渡したCSV
（省略時は scripts/ 内の viirs_sol_*.csv 全部）をその上に重ねてマージする。
同じ month/region の行があれば、後から読んだ方（＝引数のCSV）が優先される。

使い方:
    python scripts/merge_raw.py                       # scripts/内のCSVを全部マージ
    python scripts/merge_raw.py path/to/new.csv ...    # 指定したCSVだけマージ
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scripts"
RAW = ROOT / "data" / "raw" / "nightlights_raw.csv"

EXCLUDE = {"viirs_region_check.csv"}


def load_csv(path: Path, rows: dict[tuple[str, str], dict[str, str]]) -> None:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            region = (row.get("region") or "").strip()
            month = (row.get("month") or "").strip()
            if not region or len(month) != 7:
                continue
            val = (row.get("sol") or "").strip()
            if val in ("", "null", "None"):
                continue
            rows[(region, month)] = {
                "month": month,
                "region": region,
                "rtype": (row.get("rtype") or "").strip() or "country",
                "sol": val,
            }


def main(argv: list[str]) -> int:
    rows: dict[tuple[str, str], dict[str, str]] = {}
    before = 0
    if RAW.exists():
        load_csv(RAW, rows)
        before = len(rows)

    if len(argv) > 1:
        files = [Path(a) for a in argv[1:]]
    else:
        files = sorted(f for f in SRC_DIR.glob("viirs_sol_*.csv") if f.name not in EXCLUDE)

    for f in files:
        if not f.exists():
            print(f"見つかりません: {f}")
            return 1
        load_csv(f, rows)
    print(f"マージしたCSV: {len(files)}個 / 既存 {before}行 → 合計 {len(rows)}行")

    RAW.parent.mkdir(parents=True, exist_ok=True)
    with RAW.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["month", "region", "rtype", "sol"])
        w.writeheader()
        for key in sorted(rows.keys(), key=lambda k: (k[0], k[1])):
            w.writerow(rows[key])
    print(f"書き出し: {RAW.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
