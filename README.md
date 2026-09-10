# 🌏 地球の夜の光 — 月次推移

VIIRS 衛星（NOAA/NASA）が観測した夜間光（夜の明るさ）を、国・地域ごとに **月単位** でグラフ化する静的 Web アプリ。GitHub Pages で無料公開できる。

- **対象地域**：地球全体 / 日本・米国・中国・インド・韓国・台湾 / アジア・ヨーロッパ・アフリカ・北アメリカ・南アメリカ・オセアニア（大陸は標準区分でまとめる）
- **指標**：Sum of Lights（範囲内の放射輝度の合計）
- **期間**：2012年4月〜（VIIRS 月次データの開始）
- **データ**：`data/nightlights.json` に同梱（サイトは静的、サーバー不要）

## 構成

```
index.html            画面
css/style.css
js/app.js              グラフ描画（Chart.js は CDN 読み込み）
data/nightlights.json  表示データ（生成物）
scripts/gee_export.js  Google Earth Engine 用スクリプト（データ集計）
scripts/build_data.py  GEE の CSV → nightlights.json
scripts/make_sample.py 表示確認用のサンプル（架空）データ生成
```

## ローカルで見る

```bash
python -m http.server 8000
# → http://localhost:8000/
```

初期状態ではサンプル（架空）データが入っている。画面上部に警告バナーが出る。

## 実データを作る（無料・毎月手動）

1. [Google Earth Engine](https://code.earthengine.google.com/) に無料登録（非商用）。
2. `scripts/gee_export.js` の中身を Earth Engine の Code Editor に貼り付けて **Run**。
3. 右の **Tasks** タブで `viirs_sol_monthly` を **Run**（数分〜十数分）。Google ドライブ直下に `viirs_sol_monthly.csv` が出る。
   - `viirs_region_check` は地域定義の確認用（任意）。
   - World がタイムアウトする場合は `gee_export.js` の `SCALE` を `1000` に上げる。
4. CSV を `scripts/` に置いて変換：
   ```bash
   python scripts/build_data.py scripts/viirs_sol_monthly.csv
   ```
5. `data/nightlights.json` が更新される。コミットして push すれば公開サイトに反映。

毎月、2〜5 を繰り返せば最新化できる。

## デプロイ（GitHub Pages）

1. GitHub で新規リポジトリを作成（例：`tikyu-1`）。
2. このフォルダを push：
   ```bash
   git remote add origin https://github.com/git-san-934/tikyu-1.git
   git branch -M main
   git push -u origin main
   ```
3. リポジトリの **Settings → Pages** → Source を `Deploy from a branch` / `main` / `/ (root)`。
4. 数分後に `https://git-san-934.github.io/tikyu-1/` で公開。
5. ポータル（`git-san-934.github.io/portal/`）に `portal-snippet.html` のカードを1枚追加。

## データの注意点

- **高緯度の夏は欠測**：白夜期は夜間観測ができず、ヨーロッパ・アジア・北アメリカの大陸合計は毎年夏に落ち込む。傾向は「12ヶ月移動平均」で見る。
- 月明かり・オーロラ・山火事・雪面反射などのノイズがある。単月より年単位の傾向を重視。
- SOL の絶対値は集計解像度（既定 500m）に依存。地域間比較は「指数」表示（最初の月=100）が便利。

## ライセンス / 出典

- VIIRS 夜間光：Earth Observation Group, Payne Institute, Colorado School of Mines。
- 集計：Google Earth Engine（非商用）。
