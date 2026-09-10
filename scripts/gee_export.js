// VIIRS 夜間光 - 年ごとに分割して月次 Sum of Lights を書き出す
// 使い方:
//   1. この内容を Earth Engine Code Editor に全部貼って Run
//   2. 右の Tasks タブで「RUN ALL」を押す
//      -> viirs_sol_2012 ... viirs_sol_2024 が
//         Google ドライブの earthengine フォルダに出ます
//   3. 全 CSV をダウンロードして scripts/ フォルダに置く
//   4. python scripts/build_data.py scripts/

var START_YEAR = 2012;
var END_YEAR = 2024;   // データがある最後の年。新しい月が増えたら +1
var SCALE = 1000;      // 集計解像度(m)。OOM が出たら 2000 に上げる
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

var feats = [];
feats.push(ee.Feature(ee.Geometry.BBox(-180, -65, 180, 75),
                      {region: 'World', rtype: 'world'}));

Object.keys(countries).forEach(function (label) {
  var g = lsib.filter(ee.Filter.eq('country_na', countries[label]));
  feats.push(ee.Feature(g.geometry().simplify(SCALE),
                        {region: label, rtype: 'country'}));
});

Object.keys(continents).forEach(function (label) {
  var g = lsib.filter(ee.Filter.inList('wld_rgn', continents[label]));
  feats.push(ee.Feature(g.geometry().simplify(SCALE),
                        {region: label, rtype: 'continent'}));
});

var regions = ee.FeatureCollection(feats);

function exportYear(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  var yc = col.filterDate(start, end).map(clean);

  var rows = yc.map(function (img) {
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
