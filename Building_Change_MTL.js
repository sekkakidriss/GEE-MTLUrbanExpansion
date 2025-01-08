// EN: Load the administrative boundaries and filter for Montreal
// FR: Charger les limites administratives et filtrer pour Montréal
var adminBoundaries = ee.FeatureCollection("FAO/GAUL/2015/level2");
var montreal = adminBoundaries.filter(ee.Filter.eq('ADM2_NAME', 'Montréal'));
Map.addLayer(montreal, {}, 'Montreal Boundary'); // EN: Add the Montreal boundary to the map, FR: Ajouter une borne pour Montreal sur la carte
Map.centerObject(montreal, 10); // EN: Center the map on Montreal at a zoom level of 10, FR: Centrer la carte sur Montreal et fixer le Zoom sur le niveau 10

// EN: Function to get cloud-free composite for a year
// FR: Fonction pour obtenir une composition sans nuages pour une année donnée
var getYearComposite = function(year) {
  var start = ee.Date.fromYMD(year, 5, 1); // EN: Start date: May 1st FR: Date de debut: 1er Mai
  var end = ee.Date.fromYMD(year, 10, 31); // EN: End date: October 31st, FR: 31 Octobre
  
  return ee.ImageCollection('COPERNICUS/S2_SR') // EN: Sentinel-2 Surface Reflectance dataset FR: Ensemble de données de  de surface  par Sentinel-2 (For More explanation visit my blog on why I used Sentinel over Landsat and starting from 2019)
    .filterBounds(montreal) // EN: Filter images within Montreal's boundary, FR: Filtrer les images dans les limites de Montréal,
    .filterDate(start, end) // EN: Filter by date range, FR: Filtrer par date
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 8)) // EN: Filter images with less than 8% cloud cover, FR: Filtrer les images avec mois de 8% couverture nuageuse
    .select(['B8', 'B11', 'B4', 'B3', 'B2', 'B12']) // EN: Select relevant bands, FR: Sélectionnez les bandes pertinentes
    .median(); // EN:  Create a median composite, FR: Créer un composite médian
};

// EN:  Get composites for two time periods
// FR: Obtenir des compositions pour deux périodes
var earlierYear = 2019; // EN: Earlier year / FR: Année précédente
var laterYear = 2023;   // EN: Later year / FR: Année suivante

var earlierComposite = getYearComposite(earlierYear); // EN: Composite for 2019
var laterComposite = getYearComposite(laterYear); // EN: Composite for 2023

// EN: Function to calculate building mask
// FR: Fonction pour calculer le masque des bâtiments
var calculateBuildingMask = function(image) {
  // EN: NDBI: Normalized Difference Built-Up Index
  // EN: NDVI: Normalized Difference Vegetation Index
  var ndbi = image.normalizedDifference(['B11', 'B8']); // EN: Calculate NDBI
  var ndvi = image.normalizedDifference(['B8', 'B4']); // EN: Calculate NDVI
  return ndbi.gt(0).and(ndvi.lt(0.3)); // EN: Identify built-up areas: high NDBI and low NDVI
};

var earlierBuildings = calculateBuildingMask(earlierComposite); // EN: Buildings in 2019
var laterBuildings = calculateBuildingMask(laterComposite); // EN: Buildings in 2023

// EN: Detect changes between two time periods
// FR: Détecter les changements entre les deux périodes
var buildingLoss = earlierBuildings.and(laterBuildings.not()); // EN: Areas that were built-up in 2019 but not in 2023, FR: Zones construites en 2019 mais pas en 2023
var buildingGain = laterBuildings.and(earlierBuildings.not()); // EN: Areas that became built-up between 2019 and 2023, FR: Zones urbanisées entre 2019 et 2023
var stableBuildings = earlierBuildings.and(laterBuildings); // EN: Areas that remained built-up, FR: Les zones restées bâties

// EN: Add visualization layers
// FR: Ajouter des couches de visualisation

// EN: True color composites
Map.addLayer(earlierComposite, {
  bands: ['B4', 'B3', 'B2'], // EN: True color bands
  min: 0,
  max: 3000
}, earlierYear + ' True Color'); // EN:  Display the 2019 composite

Map.addLayer(laterComposite, {
  bands: ['B4', 'B3', 'B2'], // EN: True color bands
  min: 0,
  max: 3000
}, laterYear + ' True Color'); // EN: Display the 2023 composite

// EN: Building change layers
// Couches de changement des bâtiments
Map.addLayer(stableBuildings.mask(stableBuildings), 
  {palette: ['gray']}, 
  'Stable Buildings'); // EN: Stable areas
Map.addLayer(buildingLoss.mask(buildingLoss), 
  {palette: ['red']}, 
  'Potential Building Loss ' + earlierYear + ' to ' + laterYear); // EN: Loss areas
Map.addLayer(buildingGain.mask(buildingGain), 
  {palette: ['green']}, 
  'Potential Building Gain ' + earlierYear + ' to ' + laterYear); // EN: Gain areas

// EN: Calculate areas of change in km²
// FR: Calculer les zones de changement en km²
var areaImage = ee.Image.pixelArea().divide(1e6); // EN: Convert pixel area to square kilometers

var calculateArea = function(image) {
  return image.multiply(areaImage).reduceRegion({
    reducer: ee.Reducer.sum(), // EN: Sum the area
    geometry: montreal, // EN: Limit to Montreal
    scale: 10, // EN: Pixel resolution in meters
    maxPixels: 1e13
  });
};

var lossArea = calculateArea(buildingLoss); // EN: Total area of loss
var gainArea = calculateArea(buildingGain); // EN: Total area of gain
var stableArea = calculateArea(stableBuildings); // EN: Total stable area

// EN: Print statistics in GEE Console
// Afficher les statistiques
print('Change Statistics ' + earlierYear + ' to ' + laterYear + ':');
print('Potential Building Loss Area (km²):', lossArea);
print('Potential Building Gain Area (km²):', gainArea);
print('Stable Building Area (km²):', stableArea);

// EN: Add a legend
// Ajouter une légende
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

legend.add(ui.Label('Building Change Legend')); // EN: Title for the legend
legend.add(makeRow('gray', 'Stable Buildings')); // EN: Stable areas
legend.add(makeRow('#ff0000', 'Building Loss')); // EN: Loss areas
legend.add(makeRow('#00ff00', 'Building Gain')); // EN: Gain areas

Map.add(legend); // EN: Add legend to the map

