#!/usr/bin/env python3
"""GEE が書き出した CSV を data/nightlights.json に変換する。

使い方:
    python scripts/build_data.py scripts/                  # フォルダ内の viirs_sol_*.csv を全部
    python scripts/build_data.py scripts/viirs_sol_2012.csv ...   # ファイルを個別指定

CSV の列: month(YYYY-MM), region, rtype(world|country|continent), sol
標準ライブラリのみ。追加インストール不要。
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "nightlights.json"

# 表示順と日本語ラベル
LABELS = {
    "World": "地球全体",
    "Japan": "日本",
    "United States": "米国",
    "China": "中国",
    "India": "インド",
    "South Korea": "韓国",
    "Taiwan": "台湾",
    "Asia": "アジア",
    "Europe": "ヨーロッパ",
    "Africa": "アフリカ",
    "North America": "北アメリカ",
    "South America": "南アメリカ",
    "Oceania": "オセアニア",
}
ORDER = list(LABELS.keys())


def month_range(first: str, last: str) -> list[str]:
    y, m = (int(x) for x in first.split("-"))
    ly, lm = (int(x) for x in last.split("-"))
    out = []
    while (y, m) <= (ly, lm):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1

    csv_files: list[Path] = []
    for arg in argv[1:]:
        p = Path(arg)
        if not p.exists():
            print(f"見つかりません: {p}")
            return 1
        if p.is_dir():
            csv_files += sorted(p.glob("viirs_sol_*.csv"))
        else:
            csv_files.append(p)

    if not csv_files:
        print("viirs_sol_*.csv が見つかりません。")
        return 1

    raw: dict[str, dict[str, float]] = {}
    months_seen: set[str] = set()
    rtypes: dict[str, str] = {}

    for src in csv_files:
        with src.open(newline="", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                region = (row.get("region") or "").strip()
                month = (row.get("month") or "").strip()
                if not region or len(month) != 7:
                    continue
                val = (row.get("sol") or "").strip()
                months_seen.add(month)
                rtypes[region] = (row.get("rtype") or "").strip() or "country"
                if val not in ("", "null", "None"):
                    try:
                        raw.setdefault(region, {})[month] = float(val)
                    except ValueError:
                        pass

    if not months_seen:
        print("有効な行がありません。CSV の中身を確認してください。")
        return 1

    print(f"読み込んだ CSV: {len(csv_files)} 個")

    months = month_range(min(months_seen), max(months_seen))

    regions_out: dict[str, dict] = {}
    keys = [k for k in ORDER if k in raw] + [k for k in raw if k not in ORDER]
    for key in keys:
        series = raw[key]
        regions_out[key] = {
            "label_ja": LABELS.get(key, key),
            "type": rtypes.get(key, "country"),
            "values": [series.get(mo) for mo in months],
        }

    payload = {
        "meta": {
            "generated": dt.date.today().isoformat(),
            "source": "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG",
            "metric": "sum_of_lights",
            "unit": "nW·cm⁻²·sr⁻¹（画素合計）",
            "scale_m": 500,
            "sample": False,
        },
        "months": months,
        "regions": regions_out,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    filled = sum(1 for r in regions_out.values() for v in r["values"] if v is not None)
    print(
        f"書き出し: {OUT.relative_to(ROOT)}  "
        f"地域 {len(regions_out)}  月 {len(months)}  値 {filled}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
