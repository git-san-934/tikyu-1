// VIIRS 夜間光 - 月ごとに1タスクずつ Sum of Lights を書き出す (World分離版)
// 「地球全体(World)」を他の国・大陸と同じ reduceRegions に混ぜると、
// 1ヶ月分でもコストが際限なく膨らむことが分かったため、
// World だけ完全に別の・粗い解像度の単純計算に分離した。
//
// 使い方:
//   1. この内容を Earth Engine Code Editor に全部貼って Run
//   2. まずは TEST_LIMIT (下の設定) を小さいままにして、
//      Tasks タブで数個だけ RUN してみる。数分で緑チェックになればOK。
//   3. 問題なければ TEST_LIMIT を 0 にして Run し直し、RUN ALL で全部流す。
//   4. Google ドライブの earthengine フォルダを全選択→ダウンロード(ZIP)。
//   5. 展開した CSV を scripts/ に置き、
//      python scripts/build_data.py scripts/

var START = '2012-04-01';
var END = ee.Date(Date.now()).format('YYYY-MM-dd').getInfo();
var SCALE = 1000;        // 国・大陸の解像度(m)
var SCALE_WORLD = 8000;  // 地球全体は総量だけなので粗くてよい
var MIN_RAD = 0.0;
var DRIVE_FOLDER = 'earthengine';
var TEST_LIMIT = 3;      // 最初のテスト用。動作確認できたら 0 にして全月実行

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

// regions には World を含めない（国・大陸のみ）
var feats = [];
Object.keys(countries).forEach(function (label) {
  var g = lsib.filter(ee.Filter.eq('country_na', countries[label])).geometry();
  feats.push(ee.Feature(g.simplify(SCALE), {region: label, rtype: 'country'}));
});
Object.keys(continents).forEach(function (label) {
  var g = lsib.filter(ee.Filter.inList('wld_rgn', continents[label])).geometry();
  feats.push(ee.Feature(g.simplify(SCALE), {region: label, rtype: 'continent'}));
});
var regions = ee.FeatureCollection(feats);

var worldGeom = ee.Geometry.BBox(-180, -65, 180, 75);

// 月ごとの画像IDを先に一覧化
var ids = col.aggregate_array('system:index').getInfo();
if (TEST_LIMIT > 0) {
  ids = ids.slice(0, TEST_LIMIT);
}
print('タスク数: ' + ids.length);

ids.forEach(function (id) {
  var ym = id.slice(0, 4) + '-' + id.slice(4, 6);
  var img = clean(ee.Image(col.filter(ee.Filter.eq('system:index', id)).first()));

  // 国・大陸: reduceRegions
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

  // World: 別枠・粗い解像度の単純合計
  var worldVal = img.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: worldGeom,
    scale: SCALE_WORLD,
    maxPixels: 1e13,
    tileScale: 16
  }).get('avg_rad');
  var worldFeat = ee.Feature(null, {
    month: ym, region: 'World', rtype: 'world', sol: worldVal
  });

  var out = fc.merge(ee.FeatureCollection([worldFeat]));

  Export.table.toDrive({
    collection: out,
    description: 'viirs_sol_' + ym.replace('-', '_'),
    folder: DRIVE_FOLDER,
    fileFormat: 'CSV',
    selectors: ['month', 'region', 'rtype', 'sol']
  });
});
