// VIIRS 夜間光 - World + 登録済みの国ぶんの「6月・12月」実データを、
// タスク1個だけで取得する。
//
// 今までは国を追加するたびに COUNTRY 変数を書き換えて貼り直し、Tasksタブでも
// 国ごとにRunする必要があったが、これは全地域・全年・全月ぶんを1つの
// FeatureCollectionにまとめてExportするので、タスクは1個で済む
// （並列で複数タスクが走って詰まる心配もない）。
//
// 使い方:
//   1. この内容を Earth Engine Code Editor に全部貼って Run
//      （コンソールに「地域数: 9 / 行数(予定): 270（タスクは1個だけ）」のように出ればOK）
//   2. Tasks タブに `viirs_sol_all_biannual` が1個だけ出るので Run（完了まで待つ）
//   3. Google ドライブの earthengine フォルダに落ちる CSV を scripts/ に置く
//   4. 置き終わったら教えてもらえれば、build_data.py で data/nightlights.json に反映する
//
// 国を追加・削除したい場合は下の REGIONS 配列を編集する。

var MONTHS = [6, 12]; // 取得する月（6月・12月）
var START_YEAR = 2012;
var END_YEAR = ee.Date(Date.now()).get('year').getInfo();
var MIN_RAD = 0.0;
var DRIVE_FOLDER = 'earthengine';

var col = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG');
var lsib = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

function clean(img) {
  var rad = img.select('avg_rad');
  var cvg = img.select('cf_cvg');
  return rad.updateMask(cvg.gt(0)).updateMask(rad.gt(MIN_RAD)).rename('avg_rad');
}

function countryGeom(countryNa, scale) {
  return lsib.filter(ee.Filter.eq('country_na', countryNa)).geometry().simplify(scale);
}

// label: region列に出す名前（build_data.py の LABELS に対応させる）
// countryNa: USDOS/LSIB_SIMPLE/2017 の country_na 表記（Worldのみ不要）
// scale: 集計解像度(m)。海岸線が複雑で重い国は粗くする（例: カナダ=8000）
var REGIONS = [
  { label: 'World', countryNa: null, scale: 8000, rtype: 'world' },
  { label: 'Japan', countryNa: 'Japan', scale: 2000, rtype: 'country' },
  { label: 'United States', countryNa: 'United States', scale: 2000, rtype: 'country' },
  { label: 'China', countryNa: 'China', scale: 2000, rtype: 'country' },
  { label: 'India', countryNa: 'India', scale: 2000, rtype: 'country' },
  { label: 'South Korea', countryNa: 'Korea, South', scale: 2000, rtype: 'country' },
  { label: 'Taiwan', countryNa: 'Taiwan', scale: 2000, rtype: 'country' },
  { label: 'Canada', countryNa: 'Canada', scale: 8000, rtype: 'country' },
  { label: 'Australia', countryNa: 'Australia', scale: 2000, rtype: 'country' }
];

var WORLD_GEOM = ee.Geometry.BBox(-180, -65, 180, 75);

var years = [];
for (var y = START_YEAR; y <= END_YEAR; y++) years.push(y);

function monthValue(geom, scale, year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var imgs = col.filterDate(start, end);
  // その年月の画像がまだ無い場合（未来・データ未公開など）は null にする。
  return ee.Algorithms.If(
    imgs.size().gt(0),
    clean(ee.Image(imgs.first())).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: geom,
      scale: scale,
      maxPixels: 1e13,
      tileScale: 16
    }).get('avg_rad'),
    null
  );
}

// 全地域・全年・全月ぶんを1つの FeatureCollection にまとめ、
// タスクは1個だけにする（並列で複数タスクが走って詰まるのを避けるため）。
var allFeats = [];
REGIONS.forEach(function (r) {
  var geom = r.countryNa ? countryGeom(r.countryNa, r.scale) : WORLD_GEOM;
  years.forEach(function (year) {
    MONTHS.forEach(function (month) {
      var mm = (month < 10 ? '0' : '') + month;
      allFeats.push(ee.Feature(null, {
        month: year + '-' + mm,
        region: r.label,
        rtype: r.rtype,
        sol: monthValue(geom, r.scale, year, month)
      }));
    });
  });
});

var fc = ee.FeatureCollection(allFeats);
print('地域数: ' + REGIONS.length + ' / 行数(予定): ' + allFeats.length + '（タスクは1個だけ）');

Export.table.toDrive({
  collection: fc,
  description: 'viirs_sol_all_biannual',
  folder: DRIVE_FOLDER,
  fileFormat: 'CSV',
  selectors: ['month', 'region', 'rtype', 'sol']
});
