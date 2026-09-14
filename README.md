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

## 実データを作る（無料・手動）

### World + 登録済みの国ぶんを6月・12月でまとめて取る（推奨）

`scripts/gee_export_all_biannual.js` に World と国が登録済みで、全地域・全年・
全月ぶんを1つにまとめてタスク1個だけで取得する。国を増やしたいときはこの
ファイルの `REGIONS` 配列に追記するだけでよい（変数を毎回書き換えて貼り直す
必要がない）。

1. [Google Earth Engine](https://code.earthengine.google.com/) に無料登録（非商用）。
2. `scripts/gee_export_all_biannual.js` の中身を Code Editor に貼り付けて **Run**。
3. **Tasks** タブに `viirs_sol_all_biannual` が1個だけ出るので **Run**（完了まで待つ）。
4. Google ドライブの `earthengine` フォルダに落ちる CSV を `scripts/` に置く。
5. 変換：
   ```bash
   python scripts/build_data.py scripts/viirs_sol_all_biannual.csv
   ```
6. `data/nightlights.json` が更新される。コミットして push すれば公開サイトに反映。

新しい月のデータを追加したいときは `gee_export_all_biannual.js` の `MONTHS` を
書き換えて（例: `[6, 12]` → `[3, 6, 9, 12]`）同じ手順を繰り返せばよい。

### 1つの国・地域だけ試したいとき（軽量・単発）

- 地球全体だけ：`scripts/gee_export_world_annual.js`
- 国を1つだけ：`scripts/gee_export_country_annual.js`（先頭の `COUNTRY` / `REGION_LABEL` /
  `EXPORT_NAME` を書き換えてから貼る）

どちらも年1点（6月・年次平均）の軽量版。タスクは1個だけなので、まず動作確認したいときや、
新しい国を1つだけ試したいときに使う。

### 国・大陸別の月次データも作る（フル版・重い）

1. `scripts/gee_export.js` の中身を Earth Engine の Code Editor に貼り付けて **Run**。
2. 右の **Tasks** タブで各月のタスクを **Run**（数分〜十数分／月）。Google ドライブ直下に
   `viirs_sol_YYYY_MM.csv` が月ごとに出る。
   - `viirs_region_check` は地域定義の確認用（任意）。
3. CSV を `scripts/` に置いて変換：
   ```bash
   python scripts/build_data.py scripts/
   ```
4. `data/nightlights.json` が更新される。コミットして push すれば公開サイトに反映。

毎月、上記を繰り返せば最新化できる。

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
