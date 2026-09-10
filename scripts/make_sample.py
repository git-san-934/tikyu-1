#!/usr/bin/env python3
"""表示確認用のサンプル(架空)データを data/nightlights.json に書き出す。

実データではありません。GEE を動かす前に画面の見た目を確認するためのものです。
    python scripts/make_sample.py
"""
from __future__ import annotations

import datetime as dt
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "nightlights.json"

random.seed(42)

# key: (日本語, type, 2012年の基準値, 年成長率, 高緯度=夏に欠測)
REGIONS = {
    "World":         ("地球全体", "world",     4.0e7, 0.020, False),
    "Japan":         ("日本",     "country",   9.0e5, -0.004, False),
    "United States": ("米国",     "country",   7.5e6, 0.006, True),
    "China":         ("中国",     "country",   5.0e6, 0.075, False),
    "India":         ("インド",   "country",   1.6e6, 0.090, False),
    "South Korea":   ("韓国",     "country",   5.2e5, 0.010, False),
    "Taiwan":        ("台湾",     "country",   2.3e5, 0.012, False),
    "Asia":          ("アジア",   "continent", 1.4e7, 0.055, True),
    "Europe":        ("ヨーロッパ", "continent", 9.0e6, 0.003, True),
    "Africa":        ("アフリカ", "continent", 1.5e6, 0.060, False),
    "North America": ("北アメリカ", "continent", 9.0e6, 0.008, True),
    "South America": ("南アメリカ", "continent", 2.2e6, 0.025, False),
    "Oceania":       ("オセアニア", "continent", 6.0e5, 0.012, False),
}


def months_list() -> list[str]:
    out, y, m = [], 2012, 4
    end = (2025, 12)
    while (y, m) <= end:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def main() -> None:
    months = months_list()
    regions_out = {}
    for key, (ja, rtype, base, growth, high_lat) in REGIONS.items():
        values = []
        for i, mo in enumerate(months):
            year_frac = i / 12.0
            month = int(mo[5:7])
            if high_lat and month in (5, 6, 7):
                values.append(None)  # 夏の欠測
                continue
            trend = base * ((1 + growth) ** year_frac)
            season = 1 + 0.05 * math.cos((month - 1) / 12 * 2 * math.pi)
            noise = random.uniform(0.95, 1.05)
            values.append(round(trend * season * noise, 1))
        regions_out[key] = {"label_ja": ja, "type": rtype, "values": values}

    payload = {
        "meta": {
            "generated": dt.date.today().isoformat(),
            "source": "サンプル（架空データ）",
            "metric": "sum_of_lights",
            "unit": "nW·cm⁻²·sr⁻¹（画素合計・架空）",
            "scale_m": 500,
            "sample": True,
        },
        "months": months,
        "regions": regions_out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"サンプルを書き出しました: {OUT.relative_to(ROOT)}  ({len(months)} ヶ月)")


if __name__ == "__main__":
    main()
