// VIIRS 夜間光 - 指定した1か国の「年次」Sum of Lights だけを取得する軽量版。
// gee_export_world_annual.js と同じレベル（年1点・粗い解像度・1タスク）で、
// 国ごとに手早く実データを取り込むためのスクリプト。
//
// 使い方:
//   1. 下の COUNTRY / REGION_LABEL / EXPORT_NAME を対象の国に合わせて書き換える
//      （国名は変えても LABELS 側で日本語表示にできるよう region 列は英語のままにする）
//   2. この内容を Earth Engine Code Editor に全部貼って Run
//   3. Tasks タブに出るタスクを Run（1タスクのみ、数分で完了するはず）
//   4. Google ドライブの earthengine フォルダに落ちた CSV を scripts/ に置く
//   5. python scripts/build_data.py scripts/          ← フォルダ指定なら
//      これまでの CSV（World分など）とまとめて data/nightlights.json に反映される

var COUNTRY = 'Canada';        // USDOS/LSIB_SIMPLE/2017 の country_na に合わせる
var REGION_LABEL = 'Canada';   // region 列の値。build_data.py の LABELS に対応させる
var EXPORT_NAME = 'viirs_sol_canada_annual';

var START_YEAR = 2012;
var END_YEAR = ee.Date(Date.now()).get('year').getInfo();
var SCALE = 2000; // 国単位・年次の総量だけなので粗くてよい
var MIN_RAD = 0.0;
var DRIVE_FOLDER = 'earthengine';

var col = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG');
var lsib = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var geom = lsib.filter(ee.Filter.eq('country_na', COUNTRY)).geometry().simplify(SCALE);

function clean(img) {
  var rad = img.select('avg_rad');
  var cvg = img.select('cf_cvg');
  return rad.updateMask(cvg.gt(0)).updateMask(rad.gt(MIN_RAD)).rename('avg_rad');
}

var years = ee.List.sequence(START_YEAR, END_YEAR);

var feats = years.map(function (y) {
  y = ee.Number(y);
  var yearCol = col.filter(ee.Filter.calendarRange(y, y, 'year')).map(clean);
  // データが無い年（例：VCMSLCFGは2014年より前が空）は null にする。
  var val = ee.Algorithms.If(
    yearCol.size().gt(0),
    yearCol.mean().reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: geom,
      scale: SCALE,
      maxPixels: 1e13,
      tileScale: 16
    }).get('avg_rad'),
    null
  );
  return ee.Feature(null, {
    month: y.format('%d').cat('-06'), // 年央(6月)を代表点として1年1点にする
    region: REGION_LABEL,
    rtype: 'country',
    sol: val
  });
});

var fc = ee.FeatureCollection(feats);
print('年数: ', years.length());
print(fc);

Export.table.toDrive({
  collection: fc,
  description: EXPORT_NAME,
  folder: DRIVE_FOLDER,
  fileFormat: 'CSV',
  selectors: ['month', 'region', 'rtype', 'sol']
});
