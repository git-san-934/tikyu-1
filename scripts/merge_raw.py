#!/usr/bin/env python3
"""scripts/ にある viirs_sol_*.csv を1つの data/raw/nightlights_raw.csv にまとめる。

自動更新の仕組みを入れる前の、手作業で集めたCSV群の一本化用（一度使ったら
基本的には再実行しない）。同じ month/region の行が複数ファイルにあった場合は
ファイル名の昇順で最後に読んだものを採用する。
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scripts"
OUT = ROOT / "data" / "raw" / "nightlights_raw.csv"

EXCLUDE = {"viirs_region_check.csv"}


def main() -> int:
    files = sorted(
        f for f in SRC_DIR.glob("viirs_sol_*.csv") if f.name not in EXCLUDE
    )
    rows: dict[tuple[str, str], dict[str, str]] = {}
    for f in files:
        with f.open(newline="", encoding="utf-8-sig") as fh:
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
    print(f"読み込んだCSV: {len(files)}個 / 行数: {len(rows)}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["month", "region", "rtype", "sol"])
        w.writeheader()
        for key in sorted(rows.keys(), key=lambda k: (k[0], k[1])):
            w.writerow(rows[key])
    print(f"書き出し: {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
