// EN: Load the administrative boundaries and filter for Montreal
// FR: Charger les limites administratives et filtrer pour Montréal
var adminBoundaries = ee.FeatureCollection("FAO/GAUL/2015/level2");
var montreal = adminBoundaries.filter(ee.Filter.eq('ADM2_NAME', 'Montréal'));
Map.addLayer(montreal, {}, 'Montreal Boundary');
Map.centerObject(montreal, 10);

// EN: Load Sentinel-2 dataset with required bands (including B12 for EBBI calculation)
// FR: Charger le jeu de données Sentinel-2 avec les bandes nécessaires (y compris B12 pour le calcul de l'EBBI)
var s2 = ee.ImageCollection('COPERNICUS/S2_SR')
          .filterBounds(montreal)
          .filter(ee.Filter.calendarRange(5, 10, 'month'))  // EN: Filter May to October / FR: Filtrer de mai à octobre
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 8))  // EN: Cloud threshold < 8% / FR: Seuil de nuages < 8%
          .select(['B8', 'B11', 'B4', 'B3', 'B2', 'B12']);  // EN: Include B12 for EBBI / FR: Inclure B12 pour EBBI

// EN: Function to calculate urban area using NDBI and EBBI methods
// FR: Fonction pour calculer la surface urbaine en utilisant les méthodes NDBI et EBBI
var getUrbanArea = function(year) {
  var eeYear = ee.Number(year);
  var start = ee.Date.fromYMD(eeYear, 5, 1);  // EN: Start date / FR: Date de début
  var end = ee.Date.fromYMD(eeYear, 10, 31);  // EN: End date / FR: Date de fin
  
  var yearImages = s2.filterDate(start, end);
  var summerComposite = yearImages.median();
  
  // EN: Calculate NDBI and NDVI indices
  // FR: Calculer les indices NDBI et NDVI
  var ndbi = summerComposite.normalizedDifference(['B11', 'B8']);
  var ndvi = summerComposite.normalizedDifference(['B8', 'B4']);
  
  // EN: Calculate EBBI index
  // FR: Calculer l'indice EBBI
  var ebbi = summerComposite.expression(
    '(SWIR1 - NIR) / (10 * sqrt(SWIR1 + SWIR2))', {
      'SWIR1': summerComposite.select('B11'),
      'NIR': summerComposite.select('B8'),
      'SWIR2': summerComposite.select('B12')
    });
  
  // EN: Create urban masks for NDBI and EBBI methods
  // FR: Créer des masques urbains pour les méthodes NDBI et EBBI
  var ndbiMask = ndbi.gt(0).and(ndvi.lt(0.3)).rename('ndbi_urban');
  var ebbiMask = ebbi.gt(0).rename('ebbi_urban');
  
  // EN: Calculate urban area in square kilometers
  // FR: Calculer la surface urbaine en kilomètres carrés
  var areaImage = ee.Image.pixelArea().divide(1e6);
  
  var ndbiArea = ndbiMask.multiply(areaImage).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: montreal,
    scale: 10,
    maxPixels: 1e13
  });
  
  var ebbiArea = ebbiMask.multiply(areaImage).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: montreal,
    scale: 10,
    maxPixels: 1e13
  });
  
  return ee.Feature(null, {
    'year': eeYear,
    'ndbi_urban_area': ee.Number(ndbiArea.get('ndbi_urban')),
    'ebbi_urban_area': ee.Number(ebbiArea.get('ebbi_urban'))
  });
};

// EN: Define years to analyze
// FR: Définir les années à analyser
var years = ee.List.sequence(2019, 2024);

// EN: Calculate urban areas for all years
// FR: Calculer les surfaces urbaines pour toutes les années
var urbanAreas = ee.FeatureCollection(years.map(function(year) {
  return getUrbanArea(year);
}));

// EN: Print the results
// FR: Afficher les résultats
print('Urban Areas by Year:', urbanAreas);

// EN: Visualize data for the most recent year
// FR: Visualiser les données de l'année la plus récente
var mostRecentYear = ee.Number(years.get(years.length().subtract(1)));
var recentYearImages = s2.filterDate(
  ee.Date.fromYMD(mostRecentYear, 5, 1),
  ee.Date.fromYMD(mostRecentYear, 10, 31)
);

var recentComposite = recentYearImages.median();

// EN: Calculate indices for the most recent year
// FR: Calculer les indices pour l'année la plus récente
var recentNDBI = recentComposite.normalizedDifference(['B11', 'B8']);
var recentNDVI = recentComposite.normalizedDifference(['B8', 'B4']);
var recentEBBI = recentComposite.expression(
  '(SWIR1 - NIR) / (10 * sqrt(SWIR1 + SWIR2))', {
    'SWIR1': recentComposite.select('B11'),
    'NIR': recentComposite.select('B8'),
    'SWIR2': recentComposite.select('B12')
  });

// EN: Create urban masks for visualization
// FR: Créer des masques urbains pour la visualisation
var recentNDBIMask = recentNDBI.gt(0).and(recentNDVI.lt(0.3));
var recentEBBIMask = recentEBBI.gt(0);

// EN: Add layers to the map
// FR: Ajouter des couches à la carte
Map.addLayer(recentComposite, {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 3000
}, 'Recent True Color Image');

Map.addLayer(recentNDBIMask.mask(recentNDBIMask), 
  {palette: ['red']}, 'NDBI Urban Area');

Map.addLayer(recentEBBIMask.mask(recentEBBIMask), 
  {palette: ['blue']}, 'EBBI Urban Area');

// EN: Create a comparison chart between NDBI and EBBI
// FR: Créer un graphique comparatif entre NDBI et EBBI
var combinedChart = ui.Chart.feature.byFeature({
  features: urbanAreas,
  xProperty: 'year',
  yProperties: ['ndbi_urban_area', 'ebbi_urban_area']
})
.setChartType('LineChart')
.setOptions({
  title: 'Urban Area in Montreal: NDBI vs EBBI Comparison',
  hAxis: {title: 'Year'},
  vAxis: {
    title: 'Urban Area (km²)',
    viewWindow: {min: 0}
  },
  lineWidth: 2,
  pointSize: 4,
  series: {
    0: {color: 'red', name: 'NDBI Method'},
    1: {color: 'blue', name: 'EBBI Method'}
  },
  legend: {position: 'bottom'}
});

print(combinedChart);

