// EN: Load the administrative boundaries and filter for Montreal
// FR: Charger les limites administratives et filtrer pour Montréal
var adminBoundaries = ee.FeatureCollection("FAO/GAUL/2015/level2");
var montreal = adminBoundaries.filter(ee.Filter.eq('ADM2_NAME', 'Montréal'));
Map.addLayer(montreal, {}, 'Montreal Boundary');
Map.centerObject(montreal, 10);

// EN: Load Sentinel-2 dataset for analysis
// FR: Charger le jeu de données Sentinel-2 pour l'analyse
var s2 = ee.ImageCollection('COPERNICUS/S2_SR')
          .filterBounds(montreal)
          .filter(ee.Filter.calendarRange(5, 10, 'month')) // EN: Focus on summer months; FR: Concentrez-vous sur les mois d'été
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 8)) // EN: Filter images with less than 8% cloud cover; FR: Filtrer les images avec moins de 8% de couverture nuageuse
          .select(['B8', 'B11', 'B4', 'B3', 'B2', 'B12']); // EN: Select specific bands; FR: Sélectionner des bandes spécifiques

// EN: Function to calculate urban area using multiple thresholds
// FR: Fonction pour calculer la zone urbaine avec plusieurs seuils
var getUrbanArea = function(year) {
  var eeYear = ee.Number(year);
  var start = ee.Date.fromYMD(eeYear, 5, 1);
  var end = ee.Date.fromYMD(eeYear, 10, 31);
  
  var yearImages = s2.filterDate(start, end); // EN: Filter images by year; FR: Filtrer les images par année
  var summerComposite = yearImages.median(); // EN: Create a median composite for the summer period; FR: Créer une composition médiane pour la période estivale
  
  // EN: Calculate indices for urban classification
  // FR: Calculer les indices pour la classification urbaine
  var ndbi = summerComposite.normalizedDifference(['B11', 'B8']); // EN: Normalized Difference Built-up Index (NDBI); FR: Indice de construction à différence normalisée (NDBI)
  var ndvi = summerComposite.normalizedDifference(['B8', 'B4']); // EN: Normalized Difference Vegetation Index (NDVI); FR: Indice de végétation à différence normalisée (NDVI)
  var ebbi = summerComposite.expression( // EN: Enhanced Built-up and Bare Soil Index (EBBI); FR: Indice amélioré des zones bâties et des sols nus (EBBI)
    '(SWIR1 - NIR) / (10 * sqrt(SWIR1 + SWIR2))', {
      'SWIR1': summerComposite.select('B11'),
      'NIR': summerComposite.select('B8'),
      'SWIR2': summerComposite.select('B12')
    });
  
  // EN: Create urban area masks with different thresholds
  // FR: Créer des masques de zone urbaine avec différents seuils
  var urbanMask1 = ndbi.gt(0).and(ndvi.lt(0.3)).rename('urban1'); // EN: Original threshold; FR: Seuil original
  var urbanMask2 = ndbi.gt(-0.1).and(ndvi.lt(0.4)).rename('urban2'); // EN: Lenient threshold; FR: Seuil permissif
  var urbanMask3 = ndbi.gt(0.1).and(ndvi.lt(0.2)).rename('urban3'); // EN: Strict threshold; FR: Seuil strict
  
  // EN: Calculate area for each threshold
  // FR: Calculer la surface pour chaque seuil
  var areaImage = ee.Image.pixelArea().divide(1e6); // EN: Convert pixel area to square kilometers; FR: Convertir la surface des pixels en kilomètres carrés
  
  var area1 = urbanMask1.multiply(areaImage).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: montreal,
    scale: 10,
    maxPixels: 1e13
  });
  
  var area2 = urbanMask2.multiply(areaImage).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: montreal,
    scale: 10,
    maxPixels: 1e13
  });
  
  var area3 = urbanMask3.multiply(areaImage).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: montreal,
    scale: 10,
    maxPixels: 1e13
  });
  
  // EN: Return calculated areas and additional info as a feature
  // FR: Retourner les surfaces calculées et les informations supplémentaires sous forme de caractéristique
  return ee.Feature(null, {
    'year': eeYear,
    'urban_original': ee.Number(area1.get('urban1')),
    'urban_lenient': ee.Number(area2.get('urban2')),
    'urban_strict': ee.Number(area3.get('urban3')),
    'image_count': yearImages.size()
  });
};

// EN: Calculate urban areas for all years
// FR: Calculer les zones urbaines pour toutes les années
var years = ee.List.sequence(2019, 2024);
var urbanAreas = ee.FeatureCollection(years.map(getUrbanArea));

// EN: Create diagnostic charts for analysis
// FR: Créer des graphiques de diagnostic pour l'analyse
var imageCountChart = ui.Chart.feature.byFeature(urbanAreas, 'year', 'image_count')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Number of Available Images per Year',
    hAxis: {title: 'Year'},
    vAxis: {title: 'Number of Images'},
    colors: ['#1b9e77']
  });

var thresholdComparisonChart = ui.Chart.feature.byFeature({
  features: urbanAreas,
  xProperty: 'year',
  yProperties: ['urban_original', 'urban_lenient', 'urban_strict']
})
.setChartType('LineChart')
.setOptions({
  title: 'Urban Area with Different Thresholds',
  hAxis: {title: 'Year'},
  vAxis: {title: 'Urban Area (km²)'},
  series: {
    0: {color: 'red', name: 'Original Threshold (NDBI>0, NDVI<0.3)'},
    1: {color: 'blue', name: 'Lenient Threshold (NDBI>-0.1, NDVI<0.4)'},
    2: {color: 'green', name: 'Strict Threshold (NDBI>0.1, NDVI<0.2)'}
  },
  legend: {position: 'bottom'}
});

// EN: Display diagnostics and raw data
// FR: Afficher les diagnostics et les données brutes
print('Analysis Diagnostics:');
print(imageCountChart);
print(thresholdComparisonChart);
print('Raw Data:', urbanAreas);

// EN: Visualize the most recent year with different thresholds
// FR: Visualiser l'année la plus récente avec différents seuils
var mostRecentYear = ee.Number(years.get(years.length().subtract(1)));
var recentComposite = s2.filterDate(
  ee.Date.fromYMD(mostRecentYear, 5, 1),
  ee.Date.fromYMD(mostRecentYear, 10, 31)
).median();

var recentNDBI = recentComposite.normalizedDifference(['B11', 'B8']);
var recentNDVI = recentComposite.normalizedDifference(['B8', 'B4']);

// EN: Add visualization layers to the map
// FR: Ajouter des couches de visualisation à la carte
Map.addLayer(recentComposite, {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 3000
}, 'Recent True Color Image');

Map.addLayer(recentNDBI.gt(0).and(recentNDVI.lt(0.3)).mask(recentNDBI.gt(0).and(recentNDVI.lt(0.3))), 
  {palette: ['red']}, 'Original Threshold');

Map.addLayer(recentNDBI.gt(-0.1).and(recentNDVI.lt(0.4)).mask(recentNDBI.gt(-0.1).and(recentNDVI.lt(0.4))), 
  {palette: ['blue']}, 'Lenient Threshold');

Map.addLayer(recentNDBI.gt(0.1).and(recentNDVI.lt(0.2)).mask(recentNDBI.gt(0.1).and(recentNDVI.lt(0.2))), 
  {palette: ['green']}, 'Strict Threshold');

