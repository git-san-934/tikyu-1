// VIIRS 夜間光 - 年ごとに分割して月次 Sum of Lights を書き出す (効率化版)
// 使い方:
//   1. この内容を Earth Engine Code Editor に全部貼って Run
//   2. 右の Tasks タブで「RUN ALL」を押す
//      -> viirs_sol_2012 ... viirs_sol_2024 が
//         Google ドライブの earthengine フォルダに出ます
//   3. 全 CSV をダウンロードして scripts/ フォルダに置く
//   4. python scripts/build_data.py scripts/
//
// 前バージョンは月ごとに国・大陸の図形を毎回処理してメモリ不足になったため、
// 国用・大陸用の「地域IDマップ画像」を先に1回だけ作り、月ごとはそれを
// 読むだけにして負荷を大きく下げている。

var START_YEAR = 2012;
var END_YEAR = 2024;    // データがある最後の年。新しい月が増えたら +1
var SCALE = 2000;       // 国・大陸の集計解像度(m)。OOM が出たら 3000 に上げる
var SCALE_WORLD = 4000; // 地球全体は総量だけなので粗くてよい
var MIN_RAD = 0.0;
var DRIVE_FOLDER = 'earthengine';

var col = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG');

function clean(img) {
  var rad = img.select('avg_rad');
  var cvg = img.select('cf_cvg');
  var m = rad.updateMask(cvg.gt(0)).updateMask(rad.gt(MIN_RAD));
  return m.rename('avg_rad').set('ym', img.date().format('YYYY-MM'));
}

var lsib = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

var countries = {};
countries['Japan'] = 'Japan';
countries['United States'] = 'United States';
countries['China'] = 'China';
countries['India'] = 'India';
countries['South Korea'] = 'Korea, South';
countries['Taiwan'] = 'Taiwan';

// wld_rgn の実際の値(略語)に合わせる
var asia = ['Central Asia', 'E Asia', 'N Asia'];
asia = asia.concat(['S Asia', 'SE Asia', 'SW Asia']);

var continents = {};
continents['Asia'] = asia;
continents['Europe'] = ['Europe'];
continents['Africa'] = ['Africa'];
continents['North America'] = ['North America', 'Central America', 'Caribbean'];
continents['South America'] = ['South America'];
continents['Oceania'] = ['Oceania', 'Australia'];

var worldGeom = ee.Geometry.BBox(-180, -65, 180, 75);

// ---- 地域IDマップ画像を1回だけ作る -------------------------------
var countryLabels = Object.keys(countries);
var countryFeats = countryLabels.map(function (label, i) {
  var g = lsib.filter(ee.Filter.eq('country_na', countries[label])).geometry();
  return ee.Feature(g.simplify(SCALE), {code: i + 1});
});
var countryImg = ee.Image(0).byte()
  .paint(ee.FeatureCollection(countryFeats), 'code')
  .rename('zone');

var contLabels = Object.keys(continents);
var contFeats = contLabels.map(function (label, i) {
  var g = lsib.filter(ee.Filter.inList('wld_rgn', continents[label])).geometry();
  return ee.Feature(g.simplify(SCALE), {code: i + 1});
});
var contImg = ee.Image(0).byte()
  .paint(ee.FeatureCollection(contFeats), 'code')
  .rename('zone');

// ---- 1画像・1地域IDマップぶんの集計 -------------------------------
function groupRows(img, zoneImg, labels, ym, rtype) {
  var combo = img.addBands(zoneImg);
  var out = combo.reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'code'}),
    geometry: worldGeom,
    scale: SCALE,
    maxPixels: 1e13,
    tileScale: 16,
    bestEffort: true
  });
  var groups = ee.List(out.get('groups'));
  var feats = groups.map(function (g) {
    g = ee.Dictionary(g);
    var code = ee.Number(g.get('code'));
    var label = ee.Algorithms.If(
      code.eq(0), null, ee.List(labels).get(code.subtract(1))
    );
    return ee.Feature(null, {
      month: ym,
      region: label,
      rtype: rtype,
      sol: g.get('sum')
    });
  });
  return ee.FeatureCollection(feats).filter(ee.Filter.notNull(['region']));
}

function worldRow(img, ym) {
  var val = img.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: worldGeom,
    scale: SCALE_WORLD,
    maxPixels: 1e13,
    tileScale: 16,
    bestEffort: true
  }).get('avg_rad');
  return ee.Feature(null, {month: ym, region: 'World', rtype: 'world', sol: val});
}

// ---- 年ごとにエクスポート ----------------------------------------
function exportYear(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  var yc = col.filterDate(start, end).map(clean);

  var rows = yc.map(function (img) {
    var ym = img.get('ym');
    var c1 = groupRows(img, countryImg, countryLabels, ym, 'country');
    var c2 = groupRows(img, contImg, contLabels, ym, 'continent');
    var w = ee.FeatureCollection([worldRow(img, ym)]);
    return c1.merge(c2).merge(w);
  }).flatten();

  Export.table.toDrive({
    collection: rows,
    description: 'viirs_sol_' + year,
    folder: DRIVE_FOLDER,
    fileFormat: 'CSV',
    selectors: ['month', 'region', 'rtype', 'sol']
  });
}

for (var y = START_YEAR; y <= END_YEAR; y++) {
  exportYear(y);
}

print('タスクを ' + (END_YEAR - START_YEAR + 1) + ' 個作りました。Tasks タブで RUN ALL を押してください。');
