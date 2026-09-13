// VIIRS 夜間光 - 月ごとに1タスクずつ Sum of Lights を書き出す (安全重視版)
// これまでの「年ごとにまとめて処理」はメモリ不足になったり、
// 効率化しようとした版は逆に暴走して無料枠を大量消費したため、
// 一番シンプルで軽い「1ヶ月 = 1タスク」に戻す。
//
// 使い方:
//   1. この内容を Earth Engine Code Editor に全部貼って Run
//      (少し時間がかかります。Console に「タスク数: 150」のように出ます)
//   2. 右の Tasks タブで「RUN ALL」を押す
//      -> viirs_sol_2012_04, viirs_sol_2012_05, ... という
//         月別 CSV が Google ドライブの earthengine フォルダに出ます
//      (タスクが多いので終わるまで時間がかかりますが、1つ1つは軽いです)
//   3. Google ドライブで earthengine フォルダを開き、中身を全選択して
//      右クリック→ダウンロード（ZIPでまとめて落ちます）。展開する。
//   4. 展開したフォルダの CSV を scripts/ に置き、
//      python scripts/build_data.py scripts/

var START = '2012-04-01';
var END = ee.Date(Date.now()).format('YYYY-MM-dd').getInfo();
var SCALE = 1000;
var MIN_RAD = 0.0;
var DRIVE_FOLDER = 'earthengine';

var col = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
  .filterDate(START, END);

function clean(img) {
  var rad = img.select('avg_rad');
  var cvg = img.select('cf_cvg');
  return rad.updateMask(cvg.gt(0)).updateMask(rad.gt(MIN_RAD)).rename('avg_rad');
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
  var g = lsib.filter(ee.Filter.eq('country_na', countries[label])).geometry();
  feats.push(ee.Feature(g.simplify(SCALE), {region: label, rtype: 'country'}));
});

Object.keys(continents).forEach(function (label) {
  var g = lsib.filter(ee.Filter.inList('wld_rgn', continents[label])).geometry();
  feats.push(ee.Feature(g.simplify(SCALE), {region: label, rtype: 'continent'}));
});

var regions = ee.FeatureCollection(feats);

// 月ごとの画像IDを先に一覧化 (クライアント側で151個ほどのリストを作るだけ)
var ids = col.aggregate_array('system:index').getInfo();
print('タスク数: ' + ids.length);

ids.forEach(function (id) {
  var ym = id.slice(0, 4) + '-' + id.slice(4, 6);
  var img = clean(ee.Image(col.filter(ee.Filter.eq('system:index', id)).first()));

  var fc = img.reduceRegions({
    collection: regions,
    reducer: ee.Reducer.sum().setOutputs(['sol']),
    scale: SCALE,
    tileScale: 16
  });
  fc = fc.map(function (f) {
    return ee.Feature(null, {
      month: ym,
      region: f.get('region'),
      rtype: f.get('rtype'),
      sol: f.get('sol')
    });
  });

  Export.table.toDrive({
    collection: fc,
    description: 'viirs_sol_' + ym.replace('-', '_'),
    folder: DRIVE_FOLDER,
    fileFormat: 'CSV',
    selectors: ['month', 'region', 'rtype', 'sol']
  });
});
