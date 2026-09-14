// VIIRS 夜間光 - 地球全体(World)の「年次」Sum of Lights だけを取得する軽量版。
// 国・大陸別の月次集計（gee_export.js）は月ごとに何十個もタスクを Run する必要があり
// 詰まりやすいので、まずはこちらで「World・年1点」の実データを先に取り込む。
//
// 使い方:
//   1. この内容を Earth Engine Code Editor に全部貼って Run
//   2. Tasks タブに viirs_sol_world_annual が1つだけ出るので Run（数分で完了するはず）
//   3. Google ドライブの earthengine フォルダに落ちた CSV を scripts/ に置く
//   4. python scripts/build_data.py scripts/viirs_sol_world_annual.csv
//      → data/nightlights.json に World の年次データだけが反映される
//        （国・大陸別データは既存 CSV と合わせて後から追加すればよい）

var START_YEAR = 2012;
var END_YEAR = ee.Date(Date.now()).get('year').getInfo();
var SCALE_WORLD = 8000; // 総量だけなので粗い解像度でよい
var MIN_RAD = 0.0;
var DRIVE_FOLDER = 'earthengine';

var col = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG');
var worldGeom = ee.Geometry.BBox(-180, -65, 180, 75);

function clean(img) {
  var rad = img.select('avg_rad');
  var cvg = img.select('cf_cvg');
  return rad.updateMask(cvg.gt(0)).updateMask(rad.gt(MIN_RAD)).rename('avg_rad');
}

var years = ee.List.sequence(START_YEAR, END_YEAR);

var feats = years.map(function (y) {
  y = ee.Number(y);
  var yearCol = col.filter(ee.Filter.calendarRange(y, y, 'year')).map(clean);
  // 今年分などまだ VIIRS 側に画像が無い年は空コレクションになり、
  // mean() がバンド無しの画像を返して reduceRegion がエラーになるため null にする。
  var val = ee.Algorithms.If(
    yearCol.size().gt(0),
    yearCol.mean().reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: worldGeom,
      scale: SCALE_WORLD,
      maxPixels: 1e13,
      tileScale: 16
    }).get('avg_rad'),
    null
  );
  return ee.Feature(null, {
    month: y.format('%d').cat('-06'), // 年央(6月)を代表点として1年1点にする
    region: 'World',
    rtype: 'world',
    sol: val
  });
});

var fc = ee.FeatureCollection(feats);
print('年数: ', years.length());
print(fc);

Export.table.toDrive({
  collection: fc,
  description: 'viirs_sol_world_annual',
  folder: DRIVE_FOLDER,
  fileFormat: 'CSV',
  selectors: ['month', 'region', 'rtype', 'sol']
});
