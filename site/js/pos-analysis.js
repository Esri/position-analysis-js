/**
 * Try to put all configuration settings here.
 */
var configOptions = {
    webmapTitle: "Position Analysis Web Map",
    webmapExtent: "70.3685, 34.3767, 70.546, 34.4962",
    portalUrl: "https://afmcomstaging.esri.com/arcgis",
    sharingPath: "/sharing/content/items",
    proxyRequired: true,
    proxyUrl: "/proxy.jsp",
    locateEventUrl: "https://afmcomstaging.esri.com/arcgis/rest/services/Tasks/PositionAnalysis/GPServer/LocateEvent",
    locateEventInputParameterName: "Observer_locations__bearing_and_distance_estimates_",
    locateEventOutputLinesParameterName: "Observation_lines",
    locateEventOutputAreaParameterName: "Estimated_area",
    longitudeNamesUppercase: [ "LON", "LONG", "LONGITUDE", "X" ],
    latitudeNamesUppercase: [ "LAT", "LATITUDE", "Y" ],
    mgrsNamesUppercase: [ "MGRS" ],
    azimuthNamesUppercase: [ "AZIMUTH", "BEARING", "HEADING", "ANGLE" ],
    distanceNamesUppercase: [ "DISTANCE", "DIST" ],
    titleNamesUppercase: [ "TITLE", "NAME", "LABEL" ],
    shapeNamesUppercase: [ "SHAPE", "GEOMETRY", "GEOM" ]
}

var LAYER_ID_KEY = "layerId";
var LOCATE_EVENT_LOCATING_MESSAGE = "Locating event <img border='0' cellpadding='0' cellspacing='0' src='img/ajax-loader.gif' />";

var map;
var portal;
var itemInfo;
var user;
var drawToolbar;
var gpLocateEvent;
var connectedLayers = [];
var addedGraphics = [];

require([
    "dijit/layout/BorderContainer",
    "dijit/layout/ContentPane",
    "dijit/layout/AccordionContainer",
    "dijit/form/ToggleButton",
    "dojox/form/Uploader",
    "dojox/embed/Flash",
    "dijit/form/NumberTextBox",
    "dijit/form/CheckBox",
    "dijit/form/Select",
    "dijit/InlineEditBox",
    "dijit/form/NumberSpinner",
    "dijit/Menu",
    "dijit/MenuItem",
    "esri/map",
    "esri/layers/ArcGISTiledMapServiceLayer",
    "esri/IdentityManager",
    "esri/arcgis/Portal",
    "esri/arcgis/utils",
    "esri/toolbars/draw",
    "esri/tasks/Geoprocessor",
    "dojo/on",
    "dojo/json",
    "dojo/domReady!"],
function (BorderContainer, ContentPane, AccordionContainer, ToggleButton, Uploader, Flash, NumberTextBox, CheckBox, Select, InlineEditBox, NumberSpinner, Menu, MenuItem, Map, ArcGISTiledMapServiceLayer, IdentityManager, Portal, utils, Draw, Geoprocessor, on, JSON) {
    console.log("Welcome to Position Analysis Web, using Dojo version " + dojo.version);
    
    esri.arcgis.utils.arcgisUrl = configOptions.portalUrl + configOptions.sharingPath;
    if (configOptions.proxyRequired) {
        esri.config.defaults.io.proxyUrl = configOptions.proxyUrl;
    }
    
    portal = new esri.arcgis.Portal(configOptions.portalUrl);            

    //Setup the file upload widget
    var fileInput = new Uploader({
        onChange: function (evt) {
            var input = this.focusNode;
            if (input.files && 0 < input.files.length) {
                var file = input.files[0];
                if (file.name.indexOf(".csv") !== -1) {
                    readCsvFile(file);
                }
            }
        }
    }, "addShapesUploader");
    
    gpLocateEvent = new Geoprocessor(configOptions.locateEventUrl);
    gpLocateEvent.setOutputSpatialReference({ wkid: 102100 });
    
    dojo.ready(function() {
        setVisibility("buttonSaveMap", false);
    });
});

function login() {
    portal.signIn().then(function (loggedInUser) {
        user = loggedInUser;
        var queryParams = {
            q: 'owner:"' + loggedInUser.username + '" AND title:"' + configOptions.webmapTitle + '" AND type:"Web Map"'
        };
        portal.queryItems(queryParams).then(function (queryResult) {
            require(["dojo/request/xhr"], function (xhr) {
                if (0 == queryResult.total) {
                    //Read defaultWebMapItemData.json and create from that, or ask the user to choose a Web map to use.
                    var xhrPromise = xhr("defaultWebMapItemData.jsonn", {
                        handleAs: "json"
                    });
                    xhrPromise.then(function (itemData) {
                        var item = {
                            itemType: "text",
                            owner: loggedInUser.username,
                            title: configOptions.webmapTitle,
                            type: "Web Map",
                            tags: [configOptions.webmapTitle],
                            snippet: configOptions.webmapTitle,
                            extent: configOptions.webmapExtent
                        };
                        saveWebMap(item, itemData, loggedInUser, function (webMapId) {
                            loadMap(webMapId);
                        });
                    }, function (error) {
                        console.error("Couldn't get default Web map: " + error);
                    });
                } else {
                    loadMap(queryResult.results[0].id);
                }
            });
        });    
    }, function (error) {
        console.error("Couldn't sign in: " + error);
        //TODO this isn't a bad username/password. It's more fundamental than that, like a bad
        //     portal URL or even a bad portal. Tell the user.
    });
}

function setInfoTemplate(infoTemplateContent, addLayerIdInput) {
    var graphicsLayerIndex;
    for (graphicsLayerIndex = 0; graphicsLayerIndex < map.graphicsLayerIds.length; graphicsLayerIndex++) {
        var graphicsLayerId = map.graphicsLayerIds[graphicsLayerIndex];
        var graphicsLayer = map.getLayer(graphicsLayerId);
        var infoTemplate = new esri.InfoTemplate("${TITLE}", infoTemplateContent);
        if (addLayerIdInput) {
            infoTemplate.content += "<input type='hidden' id='" + LAYER_ID_KEY + "' name='" + LAYER_ID_KEY + "' value='" + graphicsLayerId + "' />";
        }
        graphicsLayer.setInfoTemplate(infoTemplate);
    }
}

function setFieldValue(objectId, fieldName, newValue) {
    //Set value in graphic
    var graphicsLayerInput = dojo.byId(LAYER_ID_KEY);
    var graphicsLayerId = graphicsLayerInput.value;
    var layer = map.getLayer(graphicsLayerId);
    var graphicIndex;
    for (graphicIndex = 0; graphicIndex < layer.graphics.length; graphicIndex++) {
        if (layer.graphics[graphicIndex].attributes["OBJECTID"] == objectId) {
            layer.graphics[graphicIndex].attributes[fieldName] = newValue;
            break;
        }
    }
    
    //Set value in itemInfo object, which will get saved to the Web map when saveWebMap is called
    var opLayerIndex;
    var found = false;
    for (opLayerIndex = 0; opLayerIndex < itemInfo.itemData.operationalLayers.length && !found; opLayerIndex++) {
        var featureCollection = itemInfo.itemData.operationalLayers[opLayerIndex].featureCollection;
        var layerIndex;
        for (layerIndex = 0; layerIndex < featureCollection.layers.length && !found; layerIndex++) {
            var layer = featureCollection.layers[layerIndex];
            if (graphicsLayerId == layer.id) {
                var features = layer.featureSet.features;
                var featureIndex;
                for (featureIndex = 0; featureIndex < features.length && !found; featureIndex++) {
                    if (features[featureIndex].attributes["OBJECTID"] == objectId) {
                        features[featureIndex].attributes[fieldName] = newValue;
                        found = true;
                    }
                }
            }
        }
    }
}

function handleDrop(evt) {
    evt.preventDefault();
    // Reference
    // http://www.html5rocks.com/tutorials/file/dndfiles/
    // https://developer.mozilla.org/en/Using_files_from_web_applications
    var dataTransfer = evt.dataTransfer;
    var files = dataTransfer.files;
    var types = dataTransfer.types;

    // File drop?
    if (files && files.length === 1) {
        var file = files[0];
        if (file.name.indexOf(".csv") !== -1) {
            readCsvFile(file);
        }
    }
}

function readCsvFile(file) {
    var fileReader = new FileReader();
    fileReader.onloadend = function (onloadendEvent) {
        require(["dojox/data/CsvStore"], function (CsvStore) {
            var csvStore = new CsvStore({data: fileReader.result});
            csvStore.fetch({onComplete: function (items, request) {
                var itemIndex;
                for (itemIndex = 0; itemIndex < items.length; itemIndex++) {
                    var item = items[itemIndex];
                    var lon = undefined, lat = undefined, mgrs = undefined, distance = undefined, azimuth = undefined, title = undefined, shapeJson = undefined;
                    var attNames = csvStore.getAttributes(item);
                    var attNamesIndex;
                    for (attNamesIndex = 0; attNamesIndex < attNames.length; attNamesIndex++) {
                        var attName = attNames[attNamesIndex];
                        var attNamesUpper = attName.toUpperCase();
                        if (-1 < configOptions.longitudeNamesUppercase.indexOf(attNamesUpper)) {
                            lon = csvStore.getValue(item, attName);
                        } else if (-1 < configOptions.latitudeNamesUppercase.indexOf(attNamesUpper)) {
                            lat = csvStore.getValue(item, attName);
                        } else if (-1 < configOptions.mgrsNamesUppercase.indexOf(attNamesUpper)) {
                            mgrs = csvStore.getValue(item, attName);
                        } else if (-1 < configOptions.distanceNamesUppercase.indexOf(attNamesUpper)) {
                            distance = csvStore.getValue(item, attName);
                        } else if (-1 < configOptions.azimuthNamesUppercase.indexOf(attNamesUpper)) {
                            azimuth = csvStore.getValue(item, attName);
                        } else if (-1 < configOptions.titleNamesUppercase.indexOf(attNamesUpper)) {
                            title = csvStore.getValue(item, attName);
                        } else if (-1 < configOptions.shapeNamesUppercase.indexOf(attNamesUpper)) {
                            shapeJson = csvStore.getValue(item, attName);
                        }
                    }
                    if (shapeJson) {
                        addShape(dijit.registry.byId("addShapesTargetLayer").value, esri.geometry.fromJson(JSON.parse(shapeJson)), false, title, azimuth, distance);
                    } else {
                        if (!(lon && lat)) {
                            if (mgrs) {
                                var latLon = new Array(2);
                                org.mymanatee.common.usng.USNGtoLL(mgrs, latLon);
                                if (!isNaN(latLon[0]) && !(isNaN(latLon[1]))) {
                                    lon = latLon[1];
                                    lat = latLon[0];
                                }
                            }
                        }
                        if (lon && lat) {
                            addPointLatLon(dijit.registry.byId("addShapesTargetLayer").value, lon, lat, false, title, azimuth, distance);
                        }
                    }
                }
            }});
        });
    };
    fileReader.readAsText(file);
}

function loadMap(webMapId) {
    //Create the map, based on a Web map
    var mapDeferred = esri.arcgis.utils.createMap(webMapId, "map", {
        mapOptions: {
            slider: true,
            nav: false,
            wrapAround180:true
        },
        ignorePopups:false
    });

    //When the map load completes or errors out, handle it
    mapDeferred.then(function (response) {
        //Just save the map control as a variable
        map = response.map;
        
        //Set up CSV drag and drop
        var mapNode = dojo.byId("map");
        dojo.connect(mapNode, "dragenter", function (evt) {
            evt.preventDefault();
        });
        dojo.connect(mapNode, "dragover", function (evt) {
            evt.preventDefault();
        });
        dojo.connect(mapNode, "drop", handleDrop);
        
        drawToolbar = new esri.toolbars.Draw(map);
        dojo.connect(drawToolbar, "onDrawComplete", function (evt) {
            drawToolbar.deactivate();
            addPointLatLon(dijit.registry.byId("addShapesTargetLayer").value, evt.geographicGeometry.x, evt.geographicGeometry.y, false);
        });
        
        var infoTemplateContentDiv = dojo.byId("infoTemplateContent");
        var outerHtml = infoTemplateContentDiv.outerHTML;
        var innerHtml = infoTemplateContentDiv.innerHTML;
        
        setInfoTemplate(
                dojo.byId("infoTemplateContent").innerHTML,
                true);
        
        itemInfo = response.itemInfo;
        if (itemInfo && itemInfo.itemData && itemInfo.itemData.operationalLayers) {
            require(["dijit/registry", "dojo/dom-construct", "dijit/InlineEditBox", "dijit/form/TextBox"], function (registry, domConstruct, InlineEditBox, TextBox) {
                var layerListWidget = registry.byId("layerList");
                var layerListDomElement = dojo.byId("layerList");
                var layerContextMenu = registry.byId("layerContextMenu");
                var layers = itemInfo.itemData.operationalLayers;
                var layerSelectOptionsList = [];
                var i;
                for (i = 0; i < layers.length; i++) {
                    var layer = layers[i];
                    var br = domConstruct.create("br", null, layerListDomElement);
                    var checkbox = new dijit.form.CheckBox({
                        id: "checkLayers" + layer.id,
                        name: "checkLayers",
                        checked: layer.visibility,
                        value: layer.id,
                        onChange: function (checked) {
                            layer.visibility = checked;
                            var graphicsLayers = layer.featureCollection.layers;
                            var j;
                            for (j = 0; j < graphicsLayers.length; j++) {
                                map.getLayer(graphicsLayers[j].id).setVisibility(checked);
                            }
                        }
                    });
                    layerListWidget.addChild(checkbox);
                    var label = domConstruct.create("label", { id: "label" + checkbox.id, "for": checkbox.id, innerHTML: layer.title }, layerListDomElement);
                    var labelEditBox = new dijit.InlineEditBox({
                        editor: TextBox,
                        onChange: function (value) {
                            layer.title = value;
                        }
                    }, label.id);
                    layerContextMenu.bindDomNode(label.id);
                    
                    layerSelectOptionsList.push({
                        label: layer.title,
                        value: layer.id
                    });
                }
                registry.byId("addShapesTargetLayer").addOption(layerSelectOptionsList);
                registry.byId("locateEventTargetLayer").addOption(layerSelectOptionsList);
                registry.byId("rangeRingsTargetLayer").addOption(layerSelectOptionsList);
            });
        }
        
        setVisibility("buttonSaveMap", true);
    }, function(error){
        console.error('Create Map Failed: ' , dojo.toJson(error));
        //TODO this might be a bad item ID or something else. Tell the user.
    });
}

function saveMap() {
    saveWebMap(itemInfo.item, itemInfo.itemData, user);
}

/**
 * The "callback" paramater is an optional callback function that takes the Web map ID as a parameter.
 */
function saveWebMap(item, itemData, loggedInUser, callback) {
    //Remove the "layerObject" objects from itemData; they cause trouble and are superfluous
    var opLayerIndex;
    for (opLayerIndex = 0; opLayerIndex < itemData.operationalLayers.length; opLayerIndex++) {
        var opLayer = itemData.operationalLayers[opLayerIndex];
        var layerIndex;
        for (layerIndex = 0; layerIndex < opLayer.featureCollection.layers.length; layerIndex++) {
            var layer = opLayer.featureCollection.layers[layerIndex];
            layer.layerObject = undefined;
        }
    }    
    var basemapLayerIndex;
    for (basemapLayerIndex = 0; basemapLayerIndex < itemData.baseMap.baseMapLayers.length; basemapLayerIndex++) {
        var basemapLayer = itemData.baseMap.baseMapLayers[basemapLayerIndex];
        basemapLayer.layerObject = undefined;
    }

    var cont = item;
    cont.overwrite = true;
    cont.f = "json";
    var seen = [];
    try {
        cont.text = JSON.stringify(itemData, function (key, val) {
            if (typeof val == "object") {
                if (seen.indexOf(val) >= 0)
                    return;
                seen.push(val);
            }
            return val;
        });
    } catch (ex) {
        console.error("Error: " + ex);
    }
    require(["dojo/request/xhr"], function (xhr) {
        try {
            var xhrPromise = xhr(loggedInUser.userContentUrl.replace("/sharing/rest/content/users/", "/sharing/content/users/") + "/addItem?f=json&token=" + loggedInUser.credential.token, {
                handleAs: "json",
                method: "POST",
                data: cont,
                headers: {
                    "X-Requested-With": null
                }
            });
            xhrPromise.then(function (data) {
                //TODO notify the user that it worked
            }, function (error) {
                console.error("saveWebMap error: " + error);
                //TODO notify the user that it didn't work
            });
        } catch (ex) {
            console.error("saveWebMap xhr error: " + ex);
        }
    });
}

function setVisibility(widgetId, visible) {
    require(["dijit/registry"], function (registry) {
        dojo.style(registry.byId(widgetId).domNode, { visibility: visible ? "visible" : "hidden" });
    });
}

function addPointLatLon(layerId, lon, lat, centerAtPoint, title, azimuth, distance) {
    var geom = new esri.geometry.Point(lon, lat, new esri.SpatialReference({ wkid: 4326 }));
    return addShape(layerId, geom, centerAtPoint, title, azimuth, distance);
}
    
function addPointWebMercator(layerId, x, y, centerAtPoint, title, azimuth, distance) {
    var geom = new esri.geometry.Point(x, y, new esri.SpatialReference({ wkid: 102100 }));
    return addShape(layerId, geom, centerAtPoint, title, azimuth, distance);
}

function addShape(layerId, geom, centerAtShape, title, azimuth, distance) {
    var i;
    for (i = 0; i < itemInfo.itemData.operationalLayers.length; i++) {
        if (layerId == itemInfo.itemData.operationalLayers[i].id) {
            var j;
            for (j = 0; j < itemInfo.itemData.operationalLayers[i].featureCollection.layers.length; j++) {
                var layerGeomType = itemInfo.itemData.operationalLayers[i].featureCollection.layers[j].featureSet.geometryType;
                if (layerGeomType.startsWith("esriGeometry")) {
                    layerGeomType = layerGeomType.substr("esriGeometry".length);
                }
                if (layerGeomType.toLowerCase() == geom.type) {
                    if (4326 == geom.spatialReference.wkid) {
                        geom = esri.geometry.geographicToWebMercator(geom);
                    }
                    var newFeature = {
                        geometry: geom.toJson(),
                        attributes: {
                            VISIBLE: true,
                            TITLE: title ? title : "New " + layerGeomType,
                            TYPEID: 0,
                            OBJECTID: getNextObjectId(itemInfo.itemData.operationalLayers[i].featureCollection.layers[j].featureSet),
                            AZIMUTH: azimuth ? azimuth : undefined,
                            DISTANCE: distance ? distance : undefined
                        }
                    };
                    itemInfo.itemData.operationalLayers[i].featureCollection.layers[j].featureSet.features.push(newFeature);
                    
                    var graphicsLayer = map.getLayer(itemInfo.itemData.operationalLayers[i].featureCollection.layers[j].id);
                    var graphic = new esri.Graphic(newFeature);
                    addGraphic(graphicsLayer, graphic);
                    
                    if (centerAtShape) {
                        if ("point" == geom.type) {
                            map.centerAt(geom);
                        } else {
                            //TODO center on non-point shape
                        }
                    }
                    
                    break;
                }
            }
        }
    }
}

function getNextObjectId(featureSet) {
    var maxObjectId = 0;
    var i;
    for (i = 0; i < featureSet.features.length; i++) {
        if (featureSet.features[i].attributes.OBJECTID > maxObjectId) {
            maxObjectId = featureSet.features[i].attributes.OBJECTID;
        }
    }
    return maxObjectId + 1;
}

function locateEvent() {
    var locateEventStatusElement = dojo.byId("locateEventStatus");
    locateEventStatusElement.innerHTML = LOCATE_EVENT_LOCATING_MESSAGE;
    require(["esri/tasks/FeatureSet", "esri/graphic", "esri/symbols/SimpleMarkerSymbol", "dijit/registry"], function (FeatureSet, Graphic, SimpleMarkerSymbol, registry) {
        var targetLayerName = registry.byId("locateEventTargetLayer").value;
        var webMapFeatureSet;
        var pointGraphicsLayer, lineGraphicsLayer, areaGraphicsLayer;
        var opLayers = this.itemInfo.itemData.operationalLayers;
        var i;
        for (i = 0; i < opLayers.length; i++) {
            if (opLayers[i].id == targetLayerName) {
                //Get sublayers
                var sublayers = opLayers[i].featureCollection.layers;
                var j;
                for (j = 0; j < sublayers.length; j++) {
                    if (!pointGraphicsLayer && "esriGeometryPoint" == sublayers[j].layerDefinition.geometryType) {
                        webMapFeatureSet = sublayers[j].featureSet;
                        pointGraphicsLayer = sublayers[j];
                    } else if (!lineGraphicsLayer && "esriGeometryPolyline" == sublayers[j].layerDefinition.geometryType) {
                        lineGraphicsLayer = sublayers[j];
                    } else if (!areaGraphicsLayer && "esriGeometryPolygon" == sublayers[j].layerDefinition.geometryType) {
                        areaGraphicsLayer = sublayers[j];
                    }
                }
                break;
            }
        }
        if (webMapFeatureSet) {
            var featureSet = new FeatureSet();
            featureSet.features = [];
            for (var featureIndex = 0; featureIndex < webMapFeatureSet.features.length; featureIndex++) {
                var graphic = new Graphic(webMapFeatureSet.features[featureIndex]);
                featureSet.features.push(graphic);
            }
            var params = {};
            params[configOptions.locateEventInputParameterName] = featureSet;
            gpLocateEvent.submitJob(params, function (jobInfo) {
                if ("esriJobFailed" == jobInfo.jobStatus) {
                    locateEventStatusElement.innerHTML = "Could not locate";
                } else {
                    gpLocateEvent.getResultData(jobInfo.jobId, configOptions.locateEventOutputLinesParameterName/*, locateEventHandleLines, locateEventHandleLinesError*/)
                    .then(function (resultData) {
                        locateEventHandleLines(resultData, lineGraphicsLayer);
                    });
                    gpLocateEvent.getResultData(jobInfo.jobId, configOptions.locateEventOutputAreaParameterName/*, locateEventHandleAreas, locateEventHandleAreasError*/)
                    .then(function (resultData) {
                        locateEventHandleAreas(resultData, areaGraphicsLayer);
                    });
                }
            }, locateEventStatus);
        } else {
            locateEventStatusElement.innerHTML = "Could not locate";
        }
    });
}

function locateEventStatus(jobInfo) {
    var locateEventStatusElement = dojo.byId("locateEventStatus");
    switch (jobInfo.jobStatus) {
        case "esriJobExecuting": {
            locateEventStatusElement.innerHTML = LOCATE_EVENT_LOCATING_MESSAGE;
            break;
        }
        
        case "esriJobFailed": {
            locateEventStatusElement.innerHTML = "Could not locate";
            break;
        }
        
        case "esriJobSucceeded": {
            locateEventStatusElement.innerHTML = "Located event";
            break;
        }
    }
}

function locateEventHandleLines(resultData, lineGraphicsLayer) {
    var graphicsLayer = map.getLayer(lineGraphicsLayer.id);
    var features = resultData.value.features;
    for (var featureIndex = 0; featureIndex < features.length; featureIndex++) {
        var feature = features[featureIndex];
        feature.attributes["TYPEID"] = 0;
        feature.attributes["OBJECTID"] = getNextObjectId(lineGraphicsLayer.featureSet);
        addGraphic(graphicsLayer, feature);
        var featureJson = feature.toJson();
        lineGraphicsLayer.featureSet.features.push(featureJson);
    }
}

function locateEventHandleAreas(resultData, areaGraphicsLayer) {
    var graphicsLayer = map.getLayer(areaGraphicsLayer.id);
    var features = resultData.value.features;
    for (var featureIndex = 0; featureIndex < features.length; featureIndex++) {
        var feature = features[featureIndex];
        feature.attributes["TYPEID"] = 0;
        feature.attributes["OBJECTID"] = getNextObjectId(areaGraphicsLayer.featureSet);
        addGraphic(graphicsLayer, feature);
        var featureJson = feature.toJson();
        areaGraphicsLayer.featureSet.features.push(featureJson);
    }
}

function listenForRemovedGraphics(graphicsLayer) {
    //Connect to graphic-remove, to work around new graphics getting removed
    if (-1 == connectedLayers.indexOf(graphicsLayer.id)) {
        connectedLayers.push(graphicsLayer.id);
        require(["dojo/on"], function (on) {
            on(graphicsLayer, "graphic-remove", function (arg) {
                var graphic = arg.graphic;
                var layer = arg.target;
                if (-1 < addedGraphics.indexOf(graphic)) {
                    layer.add(graphic);
                }
            });
        });
    }
}

function addGraphic(graphicsLayer, graphic) {
    listenForRemovedGraphics(graphicsLayer);
    graphicsLayer.add(graphic);
    addedGraphics.push(graphic);
}
