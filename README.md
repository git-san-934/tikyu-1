# 🌏 地球の夜の光 — 月次推移

VIIRS 衛星（NOAA/NASA）が観測した夜間光（夜の明るさ）を、国・地域ごとに **月単位** でグラフ化する静的 Web アプリ。GitHub Pages で無料公開できる。

- **対象地域**：地球全体 / 日本・米国・中国・インド・韓国・台湾・カナダ・オーストラリア
- **指標**：Sum of Lights（範囲内の放射輝度の合計）
- **期間**：2014年1月〜（使用データセットの実質的な開始）、月単位（全12ヶ月）
- **データ**：`data/nightlights.json` に同梱（サイトは静的、サーバー不要）。毎月 GitHub Actions が自動更新

## 構成

```
index.html                      画面
css/style.css
js/app.js                       グラフ描画（Chart.js は CDN 読み込み）
data/nightlights.json           表示データ（生成物）
data/raw/nightlights_raw.csv    生データ台帳（month,region,rtype,sol の蓄積、自動更新もここに追記）
scripts/build_data.py           生データCSV → nightlights.json
scripts/update_from_gee.py      Earth Engineから新しい月だけ取得してraw CSVに追記（GitHub Actionsから実行）
scripts/gee_export_all_biannual.js  手動でまとめて取得したいときのEarth Engineスクリプト
scripts/make_sample.py          表示確認用のサンプル（架空）データ生成
.github/workflows/update-nightlights.yml  毎月自動更新するワークフロー
```

## 自動更新の仕組み

毎月5日（UTC 03:00 / 日本時間12:00）に GitHub Actions が自動実行され、
Earth Engine サービスアカウントで新しく公開された月のデータだけを取得し、
`data/raw/nightlights_raw.csv` に追記 → `data/nightlights.json` を再生成 →
変更があればコミット・pushする。手動での更新作業は基本的に不要。

- ワークフロー: `.github/workflows/update-nightlights.yml`
- 認証: リポジトリの Secret `GEE_SERVICE_ACCOUNT_KEY`（サービスアカウントのJSON鍵）
- 手動で今すぐ動かしたい場合は GitHub の Actions タブ → 「Update nightlights data」→ 「Run workflow」

## ローカルで見る

```bash
python -m http.server 8000
# → http://localhost:8000/
```

初期状態ではサンプル（架空）データが入っている。画面上部に警告バナーが出る。

## 手動でデータを取得したいとき（バックフィル・トラブル時）

通常は上記の自動更新で足りるはずだが、初期構築時や自動更新が失敗したときのために
手動での取得方法も残してある。

### World + 登録済みの国ぶんを6月・12月でまとめて取る（推奨）

`scripts/gee_export_all_biannual.js` に World と国が登録済みで、全地域・全年・
全月ぶんを1つにまとめてタスク1個だけで取得する。国を増やしたいときはこの
ファイルの `REGIONS` 配列に追記するだけでよい（変数を毎回書き換えて貼り直す
必要がない）。

1. [Google Earth Engine](https://code.earthengine.google.com/) に無料登録（非商用）。
2. `scripts/gee_export_all_biannual.js` の中身を Code Editor に貼り付けて **Run**。
3. **Tasks** タブに `viirs_sol_all_biannual` が1個だけ出るので **Run**（完了まで待つ）。
4. Google ドライブの `earthengine` フォルダに落ちる CSV を `scripts/` に置く。
5. 生データ台帳にマージしてから変換：
   ```bash
   python scripts/merge_raw.py scripts/viirs_sol_all_biannual.csv
   python scripts/build_data.py data/raw/nightlights_raw.csv
   ```
6. `data/raw/nightlights_raw.csv` と `data/nightlights.json` が更新される。コミットして push すれば公開サイトに反映。

新しい月のデータを追加したいときは `gee_export_all_biannual.js` の `MONTHS` を
書き換えて（例: `[6, 12]` → `[3, 6, 9, 12]`）同じ手順を繰り返せばよい。

### 1つの国・地域だけ試したいとき（軽量・単発）

- 地球全体だけ：`scripts/gee_export_world_annual.js`
- 国を1つだけ：`scripts/gee_export_country_annual.js`（先頭の `COUNTRY` / `REGION_LABEL` /
  `EXPORT_NAME` を書き換えてから貼る）

どちらも年1点（6月・年次平均）の軽量版。タスクは1個だけなので、まず動作確認したいときや、
新しい国を1つだけ試したいときに使う。

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
