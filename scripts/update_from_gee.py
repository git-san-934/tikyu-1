#!/usr/bin/env python3
"""Earth Engine から新しい月のデータだけを取得し、data/raw/nightlights_raw.csv に追記する。

GitHub Actions から毎月自動実行される想定。VIIRS月次データは公開までラグがあるため、
「直近 CHECK_MONTHS_BACK ヶ月」を毎回チェックし、まだ raw CSV に無い
(region, month) の組み合わせだけを Earth Engine に問い合わせる
（すでにある月は問い合わせない＝軽い）。まだ公開されていない月は
黙ってスキップし、翌月以降の実行で自然に埋まる。

環境変数 GEE_SERVICE_ACCOUNT_KEY にサービスアカウントキー(JSON文字列)が必要。

使い方:
    python scripts/update_from_gee.py
    # 更新後、python scripts/build_data.py data/raw/nightlights_raw.csv で
    # data/nightlights.json を再生成する（このスクリプトはCSVの更新のみ行う）
"""
from __future__ import annotations

import csv
import datetime
import json
import os
from pathlib import Path

import ee

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "nightlights_raw.csv"

# gee_export_all_biannual.js の REGIONS と対応させる。国・地域を増やす場合は
# 両方に追記すること。
REGIONS = [
    {"label": "World", "country_na": None, "scale": 8000, "rtype": "world"},
    {"label": "Japan", "country_na": "Japan", "scale": 2000, "rtype": "country"},
    {"label": "United States", "country_na": "United States", "scale": 2000, "rtype": "country"},
    {"label": "China", "country_na": "China", "scale": 2000, "rtype": "country"},
    {"label": "India", "country_na": "India", "scale": 2000, "rtype": "country"},
    {"label": "South Korea", "country_na": "Korea, South", "scale": 2000, "rtype": "country"},
    {"label": "Taiwan", "country_na": "Taiwan", "scale": 2000, "rtype": "country"},
    {"label": "Canada", "country_na": "Canada", "scale": 8000, "rtype": "country"},
    {"label": "Australia", "country_na": "Australia", "scale": 2000, "rtype": "country"},
]

CHECK_MONTHS_BACK = 6  # 公開ラグを見込んで、直近何ヶ月分を毎回チェックするか
MIN_RAD = 0.0


def init_ee() -> None:
    key_json = os.environ["GEE_SERVICE_ACCOUNT_KEY"]
    info = json.loads(key_json)
    credentials = ee.ServiceAccountCredentials(info["client_email"], key_data=key_json)
    ee.Initialize(credentials, project=info["project_id"])


def clean(img):
    rad = img.select("avg_rad")
    cvg = img.select("cf_cvg")
    return rad.updateMask(cvg.gt(0)).updateMask(rad.gt(MIN_RAD)).rename("avg_rad")


def country_geom(country_na: str, scale: int):
    lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
    return lsib.filter(ee.Filter.eq("country_na", country_na)).geometry().simplify(scale)


MIN_COVERAGE = 0.3  # 領域内でこの割合以上、有効な観測(cf_cvg>0)が無い月は欠測扱いにする


def month_value(col, geom, scale: int, year: int, month: int):
    start = ee.Date.fromYMD(year, month, 1)
    end = start.advance(1, "month")
    imgs = col.filterDate(start, end)
    if imgs.size().getInfo() == 0:
        return None
    raw_img = ee.Image(imgs.first())

    # 雲などでその月ほぼ全域が観測できていない場合、残ったごく僅かな領域だけを
    # 合計してしまい、実態とかけ離れた極端に小さい値になることがある
    # （台湾2022-07で確認済み）。有効画素の面積比が低すぎる月は欠測(null)にする。
    coverage = (
        raw_img.select("cf_cvg")
        .gt(0)
        .reduceRegion(reducer=ee.Reducer.mean(), geometry=geom, scale=scale, maxPixels=1e13, tileScale=16)
        .get("cf_cvg")
        .getInfo()
    )
    if coverage is None or coverage < MIN_COVERAGE:
        return None

    img = clean(raw_img)
    val = img.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=geom,
        scale=scale,
        maxPixels=1e13,
        tileScale=16,
    ).get("avg_rad")
    return val.getInfo()


def load_raw() -> dict[tuple[str, str], dict[str, str]]:
    rows: dict[tuple[str, str], dict[str, str]] = {}
    if RAW.exists():
        with RAW.open(newline="", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                rows[(row["region"], row["month"])] = row
    return rows


def save_raw(rows: dict[tuple[str, str], dict[str, str]]) -> None:
    RAW.parent.mkdir(parents=True, exist_ok=True)
    with RAW.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["month", "region", "rtype", "sol"])
        w.writeheader()
        for key in sorted(rows.keys(), key=lambda k: (k[0], k[1])):
            w.writerow(rows[key])


def candidate_months(n_back: int) -> list[tuple[int, int]]:
    today = datetime.date.today().replace(day=1)
    months = []
    y, m = today.year, today.month
    for _ in range(n_back):
        months.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return months


def main() -> int:
    init_ee()
    world_geom = ee.Geometry.BBox(-180, -65, 180, 75)
    col = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG")
    rows = load_raw()
    months = candidate_months(CHECK_MONTHS_BACK)

    added = 0
    for r in REGIONS:
        geom = country_geom(r["country_na"], r["scale"]) if r["country_na"] else world_geom
        for year, month in months:
            month_str = f"{year:04d}-{month:02d}"
            key = (r["label"], month_str)
            if key in rows:
                continue
            val = month_value(col, geom, r["scale"], year, month)
            if val is None:
                continue
            rows[key] = {
                "month": month_str,
                "region": r["label"],
                "rtype": r["rtype"],
                "sol": repr(val),
            }
            added += 1
            print(f"追加: {r['label']} {month_str} = {val}")

    if added:
        save_raw(rows)
    print(f"新規追加: {added}件")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
