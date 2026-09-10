/* =====================================================================
 *  VIIRS 夜間光 — 国・大陸別の月次 Sum of Lights を書き出す
 *  Google Earth Engine (https://code.earthengine.google.com/) の
 *  Code Editor にこの内容をすべて貼り付けて Run してください。
 *
 *  実行後、右側の「Tasks」タブに現れる次の2タスクを Run します:
 *     - viirs_sol_monthly   … 本体データ (CSV)
 *     - viirs_region_check  … 地域定義の確認用 (CSV, 任意)
 *  数分〜十数分で Google ドライブ直下に CSV が出力されます。
 *
 *  出力した viirs_sol_monthly.csv を scripts/ に置き、
 *     python scripts/build_data.py scripts/viirs_sol_monthly.csv
 *  を実行すると data/nightlights.json が更新されます。
 * ===================================================================== */

// ---- 設定 -----------------------------------------------------------
var START = '2012-04-01';          // VIIRS 月次データの開始
var END   = ee.Date(Date.now()).format('YYYY-MM-dd').getInfo();
var SCALE = 500;                   // 集計解像度 (m)。World がタイムアウトするなら 1000 に上げる
var MIN_RAD = 0.0;                 // これ以下の放射輝度は背景ノイズとして除外 (0 で無効化)
var DRIVE_FOLDER = '';             // 空ならドライブ直下

// ---- 画像コレクション（クリーニング）------------------------------
var raw = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
            .filterDate(START, END);

function clean(img) {
  var rad = img.select('avg_rad');
  var cvg = img.select('cf_cvg');          // 有効観測数（0 は観測なし）
  var masked = rad.updateMask(cvg.gt(0)).updateMask(rad.gt(MIN_RAD));
  return masked.rename('avg_rad')
               .set('ym', img.date().format('YYYY-MM'))
               .copyProperties(img, ['system:time_start']);
}
var viirs = raw.map(clean);
print('月数', viirs.size());

// ---- 地域定義 -----------------------------------------------------
var lsib = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

// 単独で見たい国（LSIB の country_na）
var COUNTRIES = {
  'Japan':          'Japan',
  'United States':  'United States',
  'China':          'China',
  'India':          'India',
  'South Korea':    'Korea, South',
  'Taiwan':         'Taiwan'
};

// 大陸（LSIB の wld_rgn 値をまとめる）。実際の値は下の check タスクで確認可能。
var CONTINENTS = {
  'Asia':          ['Central Asia', 'East Asia', 'South Asia', 'Southeast Asia',
                    'Southwest Asia', 'Middle East', 'Asia'],
  'Europe':        ['Europe'],
  'Africa':        ['Africa'],
  'North America': ['North America', 'Central America'],
  'South America': ['South America'],
  'Oceania':       ['Oceania', 'Australia']
};

// World は矩形（速くて堅牢。VIIRS DNB は概ね緯度 ±75/-65 を覆う）
var WORLD_GEOM = ee.Geometry.BBox(-180, -65, 180, 75);

var regionFeats = [];
regionFeats.push(ee.Feature(WORLD_GEOM, { region: 'World', rtype: 'world' }));

Object.keys(COUNTRIES).forEach(function (label) {
  var g = lsib.filter(ee.Filter.eq('country_na', COUNTRIES[label])).geometry();
  regionFeats.push(ee.Feature(g, { region: label, rtype: 'country' }));
});

Object.keys(CONTINENTS).forEach(function (label) {
  var g = lsib.filter(ee.Filter.inList('wld_rgn', CONTINENTS[label])).geometry();
  regionFeats.push(ee.Feature(g, { region: label, rtype: 'continent' }));
});

var regions = ee.FeatureCollection(regionFeats);

// ---- 月ごとに各地域の放射輝度合計を出す --------------------------
var table = viirs.map(function (img) {
  var ym = img.get('ym');
  var fc = img.reduceRegions({
    collection: regions,
    reducer: ee.Reducer.sum().setOutputs(['sol']),
    scale: SCALE,
    tileScale: 16
  });
  return fc.map(function (f) {
    return ee.Feature(null, {
      month: ym,
      region: f.get('region'),
      rtype: f.get('rtype'),
      sol: f.get('sol')
    });
  });
}).flatten();

Export.table.toDrive({
  collection: table,
  description: 'viirs_sol_monthly',
  folder: DRIVE_FOLDER,
  fileFormat: 'CSV',
  selectors: ['month', 'region', 'rtype', 'sol']
});

// ---- 地域定義の確認用（任意）------------------------------------
print('LSIB wld_rgn の全値', lsib.aggregate_array('wld_rgn').distinct().sort());

var used = [];
Object.keys(CONTINENTS).forEach(function (k) { used = used.concat(CONTINENTS[k]); });
print('CONTINENTS で未使用の wld_rgn（取りこぼし確認）',
      lsib.aggregate_array('wld_rgn').distinct()
          .filter(ee.Filter.inList('item', used).not()));

var check = regions.map(function (f) {
  return ee.Feature(null, {
    region: f.get('region'),
    rtype: f.get('rtype'),
    area_Mkm2: f.geometry().area(1e4).divide(1e12)
  });
});
Export.table.toDrive({
  collection: check,
  description: 'viirs_region_check',
  folder: DRIVE_FOLDER,
  fileFormat: 'CSV',
  selectors: ['region', 'rtype', 'area_Mkm2']
});
