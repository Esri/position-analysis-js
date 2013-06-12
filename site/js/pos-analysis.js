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
    rangeRingsUrl: "https://afmcomstaging.esri.com/arcgis/rest/services/Tasks/PositionAnalysis/GPServer/RangeRings",
    rangeRingsInputRingCentersParameterName: "Range_Ring_Centers",
    rangeRingsInputRingCountParameterName: "Number_Of_Rings",
    rangeRingsInputRingIntervalParameterName: "Ring_Interval",
    rangeRingsInputDistanceUnitsParameterName: "Distance_Units",
    rangeRingsInputRadialCountParameterName: "Number_Of_Radials",
    rangeRingsOutputRingsParameterName: "Output_Rings",
    rangeRingsOutputRadialsParameterName: "Output_Radials",
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
var RANGE_RINGS_CALCULATING_MESSAGE = "Calculating range rings <img border='0' cellpadding='0' cellspacing='0' src='img/ajax-loader.gif' />";
var USE_DOWNLOADIFY = 9 >= ieVersion();

var map;
var portal;
var itemInfo;
var user;
var drawToolbar;
var gpLocateEvent;
var gpRangeRings;
var connectedLayers = [];
var addedGraphics = [];

/**
 * Adapted from http://stackoverflow.com/questions/5574842/best-way-to-check-for-ie-less-than-9-in-javascript-without-library
 */
function ieVersion() {
    var undef,
        v = 3,
        div = document.createElement('div'),
        all = div.getElementsByTagName('i');

    while (
        div.innerHTML = '<!--[if gt IE ' + (++v) + ']><i></i><![endif]-->',
        all[0]
    );

    return v > 4 ? v : undef;
}

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
    
    gpRangeRings = new Geoprocessor(configOptions.rangeRingsUrl);
    gpRangeRings.setOutputSpatialReference({ wkid: 102100 });
    
    dojo.ready(function() {
        setVisibility("buttonSaveMap", false);
    });
    
    if (USE_DOWNLOADIFY) {
        require(["dojo/request/script"], function (script){
            script.get("Downloadify/js/swfobject.js")
            .then(function (data) {
                script.get("Downloadify/js/downloadify.min.js")
                .then(function (data) {
                    Downloadify.create("exportDownloadify", {
                        filename: function () {
                            return "testfile.txt";
                        },
                        data: function () {
                            return "This is a bunch of text to save.";
                        },
                        onComplete: function(){},
                        onCancel: function(){},
                        onError: function(){},
                        transparent: false,
                        swf: 'Downloadify/media/downloadify.swf',
                        downloadImage: 'Downloadify/images/download.png',
                        width: 116,
                        height: 18,
                        transparent: true,
                        append: false
                    });
                });
            });
        });
    }
});

function login() {
    var settingsStatusElement = dojo.byId("settingsStatus");
    settingsStatusElement.innerHTML = "Logging in...";
    portal.signIn().then(function (loggedInUser) {
        settingsStatusElement.innerHTML = "Searching for " + configOptions.webmapTitle + "...";
        user = loggedInUser;
        var queryParams = {
            q: 'owner:"' + loggedInUser.username + '" AND title:"' + configOptions.webmapTitle + '" AND type:"Web Map"'
        };
        portal.queryItems(queryParams).then(function (queryResult) {
            require(["dojo/request/xhr"], function (xhr) {
                if (0 == queryResult.total) {
                    var defaultWebMapJsonUrl = "defaultWebMapItemData.json";
                    settingsStatusElement.innerHTML = "Reading default Web map...";
                    //Read defaultWebMapItemData.json and create from that, or ask the user to choose a Web map to use.
                    var xhrPromise = xhr(defaultWebMapJsonUrl, {
                        handleAs: "json"
                    });
                    xhrPromise.then(function (itemData) {
                        settingsStatusElement.innerHTML = "Read default Web map; saving to Portal...";
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
                        settingsStatusElement.innerHTML = "Sorry, but we couldn't load the default Web map at "
                            + defaultWebMapJsonUrl + ", and you don't have a Web map called \"" + configOptions.webmapTitle
                            + "\".<br/><br/>You can try going to <a target='_blank' href='" + configOptions.portalUrl
                            + "'>Portal for ArcGIS</a> and creating a Web map called \"" + configOptions.webmapTitle + "\".";
                    });
                } else {
                    loadMap(queryResult.results[0].id);
                }
            });
        });    
    }, function (error) {
        if ("ABORTED" == error.message) {
            //It's okay; the user cancelled the login
            settingsStatusElement.innerHTML = "";
        } else {
            console.error("Couldn't sign in: " + error);
            //This isn't a bad username/password. It's more fundamental than that, like a bad
            //portal URL or even a bad portal. Tell the user.
            settingsStatusElement.innerHTML = error.message;
        }
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
    for (var graphicIndex = 0; graphicIndex < layer.graphics.length; graphicIndex++) {
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

/**
 * Deletes a shape, from the map's graphics and from the Web map. You have to call saveMap or saveWebMap
 * to persist the change back to the portal.
 * @param objectId the object ID for the shape to delete. Its layer is determined by the LAYER_ID_KEY
 *                 input for the popup currently displayed.
 * @param hidePopup (optional, default is true) if true, and if only one shape is selected in the popup,
 *                  hide the map's popup (map.infoWindow) after deleting the shape.
 */
function deleteShape(objectId, hidePopup) {
    //Delete graphic
    var graphicsLayerInput = dojo.byId(LAYER_ID_KEY);
    var graphicsLayerId = graphicsLayerInput.value;
    var layer = map.getLayer(graphicsLayerId);
    for (var graphicIndex = 0; graphicIndex < layer.graphics.length; graphicIndex++) {
        if (layer.graphics[graphicIndex].attributes["OBJECTID"] == objectId) {
            //Remove from addedGraphics
            var addedGraphicsIndex = addedGraphics.indexOf(layer.graphics[graphicIndex]);
            if (0 <= addedGraphicsIndex) {
                addedGraphics.splice(addedGraphicsIndex, 1);
            }
            //Remove from graphics layer
            layer.remove(layer.graphics[graphicIndex]);
            break;
        }
    }
    
    //Delete from itemInfo object, which will get saved to the Web map when saveWebMap is called
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
                        features.splice(featureIndex, 1);
                        found = true;
                    }
                }
            }
        }
    }
    
    if (map.infoWindow.features.length > 1) {
        //Remove deleted feature from the infoWindow and select another feature
        var feature = map.infoWindow.getSelectedFeature();
        for (var featureIndex = 0; featureIndex < map.infoWindow.features.length; featureIndex++) {
            if (feature === map.infoWindow.features[featureIndex]) {
                map.infoWindow.features.splice(featureIndex, 1);//i.e. remove feature at featureIndex
                map.infoWindow.select(0 == featureIndex ? 0 : featureIndex - 1);
                break;
            }
        }
    } else if (undefined == hidePopup || true == hidePopup) {
        map.infoWindow.hide();
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
    var settingsStatusElement = dojo.byId("settingsStatus");
    settingsStatusElement.innerHTML = "Loading Web map...";
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
                    label.htmlFor = checkbox.id;
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
        settingsStatusElement.innerHTML = "";
    }, function(error){
        console.error('Create Map Failed: ' , dojo.toJson(error));
        //This might be a bad item ID or something else. Tell the user.
        settingsStatusElement.innerHTML = "Sorry, we found the Web map but couldn't load it.<br/><br/>"
            + "Details: " + error;
    });
}

function saveMap() {
    saveWebMap(itemInfo.item, itemInfo.itemData, user);
}

/**
 * The "callback" paramater is an optional callback function that takes the Web map ID as a parameter.
 */
function saveWebMap(item, itemData, loggedInUser, callback) {
    var settingsStatusElement = dojo.byId("settingsStatus");
    
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
        var xhrPromise = xhr(loggedInUser.userContentUrl.replace("/sharing/rest/content/users/", "/sharing/content/users/") + "/addItem?f=json&token=" + loggedInUser.credential.token, {
            handleAs: "json",
            method: "POST",
            data: cont,
            headers: {
                "X-Requested-With": null
            }
        });
        xhrPromise.then(function (data) {
            //Notify the user that it worked
            settingsStatusElement.innerHTML = "";
            if (callback) {
                callback(data.id);
            }
        }, function (error) {
            console.error("saveWebMap error: " + error);
            //Notify the user that it didn't work
            settingsStatusElement.innerHTML = "Sorry, saving the Web map did not work.<br/><br/>"
                + "Details: " + error;
        });
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

function calculateRangeRings() {
    var rangeRingsStatusElement = dojo.byId("rangeRingsStatus");
    rangeRingsStatusElement.innerHTML = RANGE_RINGS_CALCULATING_MESSAGE;
    require(["esri/tasks/FeatureSet", "esri/graphic", "dijit/registry"], function (FeatureSet, Graphic, registry) {
        var targetLayerName = registry.byId("rangeRingsTargetLayer").value;
        var ringCount = registry.byId("rangeRingsRingCount").value;
        var ringDistance = registry.byId("rangeRingsDistance").value;
        var radialCount = registry.byId("rangeRingsRadialCount").value;
        var webMapFeatureSet;
        var pointGraphicsLayer, lineGraphicsLayer;
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
            params[configOptions.rangeRingsInputRingCentersParameterName] = featureSet;
            params[configOptions.rangeRingsInputRingCountParameterName] = ringCount;
            params[configOptions.rangeRingsInputRingIntervalParameterName] = ringDistance;
            params[configOptions.rangeRingsInputDistanceUnitsParameterName] = "METERS";
            params[configOptions.rangeRingsInputRadialCountParameterName] = radialCount;
            gpRangeRings.submitJob(params, function (jobInfo) {
                if ("esriJobFailed" == jobInfo.jobStatus) {
                    rangeRingsStatusElement.innerHTML = "Could not calculate range rings";
                } else {
                    gpRangeRings.getResultData(jobInfo.jobId, configOptions.rangeRingsOutputRadialsParameterName)
                    .then(function (resultData) {
                        gpHandleLines(resultData, lineGraphicsLayer);
                    });
                    gpRangeRings.getResultData(jobInfo.jobId, configOptions.rangeRingsOutputRingsParameterName)
                    .then(function (resultData) {
                        gpHandleLines(resultData, lineGraphicsLayer);
                    });
                }
            }, rangeRingsStatus);
        } else {
            rangeRingsStatusElement.innerHTML = "Could not calculate range rings";
        }
    });
}

function rangeRingsStatus(jobInfo) {
    var rangeRingsStatusElement = dojo.byId("rangeRingsStatus");
    switch (jobInfo.jobStatus) {
        case "esriJobExecuting": {
            rangeRingsStatusElement.innerHTML = RANGE_RINGS_CALCULATING_MESSAGE;
            break;
        }
        
        case "esriJobFailed": {
            rangeRingsStatusElement.innerHTML = "Could not calculate range rings";
            break;
        }
        
        case "esriJobSucceeded": {
            rangeRingsStatusElement.innerHTML = "Calculated range rings";
            break;
        }
    }
}

function locateEvent() {
    var locateEventStatusElement = dojo.byId("locateEventStatus");
    locateEventStatusElement.innerHTML = LOCATE_EVENT_LOCATING_MESSAGE;
    require(["esri/tasks/FeatureSet", "esri/graphic", "dijit/registry"], function (FeatureSet, Graphic, registry) {
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
                    gpLocateEvent.getResultData(jobInfo.jobId, configOptions.locateEventOutputLinesParameterName)
                    .then(function (resultData) {
                        gpHandleLines(resultData, lineGraphicsLayer);
                    });
                    gpLocateEvent.getResultData(jobInfo.jobId, configOptions.locateEventOutputAreaParameterName)
                    .then(function (resultData) {
                        gpHandleAreas(resultData, areaGraphicsLayer);
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

function gpHandleLines(resultData, lineGraphicsLayer) {
    var graphicsLayer = map.getLayer(lineGraphicsLayer.id);
    var features = resultData.value.features;
    for (var featureIndex = 0; featureIndex < features.length; featureIndex++) {
        var feature = features[featureIndex];
        renameKeysToUpperCase(feature.attributes);
        feature.attributes["TYPEID"] = 0;
        feature.attributes["OBJECTID"] = getNextObjectId(lineGraphicsLayer.featureSet);
        addGraphic(graphicsLayer, feature);
        var featureJson = feature.toJson();
        lineGraphicsLayer.featureSet.features.push(featureJson);
    }
}

function gpHandleAreas(resultData, areaGraphicsLayer) {
    var graphicsLayer = map.getLayer(areaGraphicsLayer.id);
    var features = resultData.value.features;
    for (var featureIndex = 0; featureIndex < features.length; featureIndex++) {
        var feature = features[featureIndex];
        renameKeysToUpperCase(feature.attributes);
        feature.attributes["TYPEID"] = 0;
        feature.attributes["OBJECTID"] = getNextObjectId(areaGraphicsLayer.featureSet);
        addGraphic(graphicsLayer, feature);
        var featureJson = feature.toJson();
        areaGraphicsLayer.featureSet.features.push(featureJson);
    }
}

function renameKeysToUpperCase(obj) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].toUpperCase() != keys[i]) {
            obj[keys[i].toUpperCase()] = obj[keys[i]];
            delete obj[keys[i]];
        }
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

function downloadLayer(menuItem) {
    return downloadLayerById(dojo.byId(menuItem.getParent().currentTarget.htmlFor).value);
}

function downloadLayerById(layerId) {
    console.log("downloadLayer " + layerId);
    var pointGraphicsLayer, lineGraphicsLayer, areaGraphicsLayer;
    var opLayers = itemInfo.itemData.operationalLayers;
    for (var i = 0; i < opLayers.length; i++) {
        if (opLayers[i].id == layerId) {
            //Get sublayers
            var sublayers = opLayers[i].featureCollection.layers;
            for (var j = 0; j < sublayers.length; j++) {
                if (!pointGraphicsLayer && "esriGeometryPoint" == sublayers[j].layerDefinition.geometryType) {
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
    console.log("got layers");
    //window.open("data:application/csv;charset=utf-8,Col1%2CCol2%2CCol3%0AVal1%2CVal2%2CVal3%0AVal11%2CVal22%2CVal33%0AVal111%2CVal222%2CVal333");
    var str = "Name, Price\nApple, 2\nOrange, 3";
    var uri = 'data:text/csv;charset=utf-8,' + str;

    var downloadLink = document.createElement("a");
    downloadLink.href = encodeURI(uri);
    downloadLink.download = "data.csv";

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function completeDownload() {
    if (USE_DOWNLOADIFY) {
        require(["dijit/registry", "dijit/popup", "dojo/on"], function (registry, popup, on) {
            var layerContextMenu = registry.byId("layerContextMenu");
            var signal = on(layerContextMenu, "onShow", function () {
                console.log("in show listener");
                signal.remove();
                popup.close(layerContextMenu);
            });
            popup.open({
                popup: layerContextMenu,
                x: -999,
                y: -999
            });
        });
    }
}
