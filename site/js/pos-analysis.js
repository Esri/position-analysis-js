/*******************************************************************************
 * Copyright 2013 Esri
 * 
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 * 
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 ******************************************************************************/
 
/**
 * Try to put all configuration settings here.
 */
var configOptions = {
    webmapTitle: "Position Analysis Web Map",
    webmapExtent: "70.3685, 34.3767, 70.546, 34.4962",
    //Set the portal home URL
    //EITHER use www.arcgis.com:
    portalUrl: "https://www.arcgis.com",
    //OR use the path to your portal (this example is for when the app is deployed on the same machine as Portal):
    //portalUrl: location.protocol + "//" + location.host + "/arcgis",
    sharingPath: "/sharing/content/items",
    proxyRequired: true,
    labelColor: "#738C3D",
    locateEventInputParameterName: "Observer_locations__bearing_and_distance_estimates_",
    locateEventOutputLinesParameterName: "Observation_lines",
    locateEventOutputAreaParameterName: "Estimated_area",
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
configOptions.proxyUrl = configOptions.portalUrl + "/sharing/proxy";
//Adjust these service URLs as needed.
configOptions.locateEventUrl = configOptions.portalUrl + "/rest/services/Tasks/PositionAnalysis/GPServer/LocateEvent";
configOptions.rangeRingsUrl = configOptions.portalUrl + "/rest/services/Tasks/PositionAnalysis/GPServer/RangeRings";
configOptions.geometryServiceUrl = configOptions.portalUrl + "/rest/services/Utilities/Geometry/GeometryServer";

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
var geometryService;
var labelFont;

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
    "dojox/form/uploader/plugins/Flash",
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
    "esri/symbols/Font",
    "dojo/on",
    "dojo/json",
    "dojo/domReady!"],
function (BorderContainer, ContentPane, AccordionContainer, ToggleButton, Uploader, Flash, NumberTextBox, CheckBox, Select, InlineEditBox, NumberSpinner, Menu, MenuItem, Map, ArcGISTiledMapServiceLayer, IdentityManager, Portal, utils, Draw, Geoprocessor, Font, on, JSON) {
    console.log("Welcome to Position Analysis Web, using Dojo version " + dojo.version);
    
    labelFont = new Font().setFamily("Arial").setSize("13pt");
    
    if (9 <= ieVersion()) {
        dojo.byId("csvUploadMessage").innerHTML = "Upload CSV here:";
    }
    
    esri.arcgis.utils.arcgisUrl = configOptions.portalUrl + configOptions.sharingPath;
    if (configOptions.proxyRequired) {
        esri.config.defaults.io.proxyUrl = configOptions.proxyUrl;
    }
    
    portal = new esri.arcgis.Portal(configOptions.portalUrl);            

    //Setup the file upload widget
    var fileInput = new dojox.form.Uploader({
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
        login();
    });
    
    if (USE_DOWNLOADIFY) {
        require(["dojo/request/script"], function (script){
            script.get("Downloadify/js/swfobject.js")
            .then(function (data) {
                script.get("Downloadify/js/downloadify.min.js")
                .then(function (data) {
                    require(["dijit/registry"], function (registry) {
                        var downloadifyElementName = "exportDownloadify";
                        Downloadify.create(downloadifyElementName, {
                            filename: function () {
                                var menuItem = registry.byId("exportLayerMenuItem");
                                return menuItem.getParent().currentTarget.innerHTML + ".csv";
                            },
                            data: function () {
                                var exportLayerMenuItem = registry.byId("exportLayerMenuItem");
                                return layerToJson(exportLayerMenuItem);
                            },
                            onComplete: function(){},
                            onCancel: function(){},
                            onError: function(){},
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
        });
    }
});

function login() {
    var settingsStatusElement = dojo.byId("settingsStatus");
    settingsStatusElement.innerHTML = "Logging in...";
    portal.signIn().then(function (loggedInUser) {
        require(["esri/tasks/GeometryService"], function (GeometryService) {
            geometryService = new GeometryService(configOptions.geometryServiceUrl);
        });
        user = loggedInUser;
        var query = esri.urlToObject(document.location.href).query;
        if (query && query.webmap) {
            loadMap(query.webmap);
        } else {
            settingsStatusElement.innerHTML = "Searching for " + configOptions.webmapTitle + "...";
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
        }
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

function logout() {
    portal.signOut().then(function (portalInfo) {
        document.cookie = "esri_auth=;path=/;expires=" + new Date(0).toUTCString();
        location.reload();
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
        if (layer.graphics[graphicIndex].attributes && layer.graphics[graphicIndex].attributes["OBJECTID"] == objectId) {
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
    var opLayerId;
    var found = false;
    for (var opLayerIndex = 0; opLayerIndex < itemInfo.itemData.operationalLayers.length && !found; opLayerIndex++) {
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
                        opLayerId = itemInfo.itemData.operationalLayers[opLayerIndex].id;
                        found = true;
                    }
                }
            }
        }
    }
    
    if (opLayerId) {
        require(["dijit/registry"], function (registry) {
            if (registry.byId("labelFeaturesMenuItem").checked) {
                labelLayerChecked(opLayerId, false);
                labelLayerChecked(opLayerId, true);
            }
        });
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
        var innerHtml = infoTemplateContentDiv.innerHTML;
        
        itemInfo = response.itemInfo;
        if (itemInfo && itemInfo.itemData && itemInfo.itemData.operationalLayers) {
            if (0 == itemInfo.itemData.operationalLayers.length) {
                createOperationalLayer("Map Notes", function (newLayer) {
                    itemInfo.itemData.operationalLayers.push(newLayer);
                    setupLayerCheckboxes(itemInfo.itemData.operationalLayers);
                });                
            } else {
                setupLayerCheckboxes(itemInfo.itemData.operationalLayers);
            }
        } else {
            settingsStatusElement.innerHTML = "Note: could not find Web map's operational layers. You might "
                    + "not be able to add features to the map.";
        }
    }, function(error){
        console.error('Create Map Failed: ' , dojo.toJson(error));
        //This might be a bad item ID or something else. Tell the user.
        settingsStatusElement.innerHTML = "Sorry, we found the Web map but couldn't load it.<br/><br/>"
            + "Details: " + error;
    });
}

function setupLayerCheckboxes(operationalLayers) {
    require(["dijit/registry", "dojo/dom-construct", "dijit/InlineEditBox", "dijit/form/TextBox"], function (registry, domConstruct, InlineEditBox, TextBox) {
        var layerListDomElement = dojo.byId("layerList");
        var settingsStatusElement = dojo.byId("settingsStatus");
        var layerListWidget = registry.byId("layerList");
        var layerContextMenu = registry.byId("layerContextMenu");
        var layerSelectOptionsList = [];
        for (var i = 0; i < operationalLayers.length; i++) {
            var layer = operationalLayers[i];
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
        
        setInfoTemplate(dojo.byId("infoTemplateContent").innerHTML, true);
        
        setVisibility("buttonSaveMap", true);
        settingsStatusElement.innerHTML = "";
    });
}

/**
 * Creates an operational layer, and adds a corresponding GraphicsLayer to the map.
 * The callback's parameter is the operational layer JSON object.
 */
function createOperationalLayer(name, callback) {
    require(["dojo/request/xhr", "esri/layers/GraphicsLayer", "esri/renderers/jsonUtils", "dojo/_base/lang"], function (xhr, GraphicsLayer, jsonUtils, lang) {
        xhr("defaultWebMapItemData.json", {
            handleAs: "json"
        }).then(function (itemData) {
            var layer = 0 < itemData.operationalLayers.length ? itemData.operationalLayers[0] : null;
            if (layer) {
                var guid = randomUUID();
                layer.id = "mapNotes_" + guid;
                for (var i = 0; i < layer.featureCollection.layers.length; i++) {
                    layer.featureCollection.layers[i].id = "mapNotes_" + guid + "_" + i;
                    var graphicsLayer = new GraphicsLayer({
                        id: layer.featureCollection.layers[i].id
                    });
                    var rendererJson = layer.featureCollection.layers[i].layerDefinition.drawingInfo.renderer;
                    var renderer = jsonUtils.fromJson(lang.clone(rendererJson));
                    graphicsLayer.setRenderer(renderer);
                    map.addLayer(graphicsLayer);
                }
            }
            callback(layer);
        });
    });
}

/**
 * Callback is optional and takes the Web map ID as a parameter.
 */
function saveMap(callback) {
    saveWebMap(itemInfo.item, itemInfo.itemData, user, callback);
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
                if (0 === layerGeomType.indexOf("esriGeometry")) {
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
                    require(["dojo/promise/all", "dijit/registry"], function (all, registry) {
                        all([
                            gpRangeRings.getResultData(jobInfo.jobId, configOptions.rangeRingsOutputRingsParameterName),
                            gpRangeRings.getResultData(jobInfo.jobId, configOptions.rangeRingsOutputRadialsParameterName)                            
                        ]).then(function (results) {
                            gpHandleLines(results[0], lineGraphicsLayer);
                            gpHandleLines(results[1], lineGraphicsLayer);
                            
                            if (registry.byId("labelFeaturesMenuItem").checked) {
                                labelLayerChecked(targetLayerName, false);
                                labelLayerChecked(targetLayerName, true);
                            }
                        });
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
        for (var i = 0; i < opLayers.length; i++) {
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
                    require(["dojo/promise/all", "dijit/registry"], function (all, registry) {
                        all([
                            gpLocateEvent.getResultData(jobInfo.jobId, configOptions.locateEventOutputLinesParameterName),
                            gpLocateEvent.getResultData(jobInfo.jobId, configOptions.locateEventOutputAreaParameterName)
                        ]).then(function (results) {
                            gpHandleLines(results[0], lineGraphicsLayer);
                            gpHandleAreas(results[1], areaGraphicsLayer);
                            
                            if (registry.byId("labelFeaturesMenuItem").checked) {
                                labelLayerChecked(targetLayerName, false);
                                labelLayerChecked(targetLayerName, true);
                            }
                        });
                    });
                }
            }, locateEventStatus);
        } else {
            locateEventStatusElement.innerHTML = "Could not locate event. Do all of the points in the specified layer have an azimuth and a distance?";
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

function getLayerIdByMenuItem(menuItem) {
    return dojo.byId(menuItem.getParent().currentTarget.htmlFor).value;
}

function labelLayerChecked(layerId, checked) {
    var opLayer = getOperationalLayerById(layerId);
    if (opLayer) {
        require(["esri/graphic", "esri/symbols/TextSymbol", "esri/geometry/Point"], function (Graphic, TextSymbol, Point) {
            var sublayers = opLayer.featureCollection.layers;
            for (var i = 0; i < sublayers.length; i++) {
                var graphicsLayer = map.getLayer(sublayers[i].id);
                var graphicsLayerInitialLength = graphicsLayer.graphics.length;
                var graphicsToRemove = [];
                for (var graphicIndex = 0; graphicIndex < graphicsLayerInitialLength; graphicIndex++) {
                    var graphic = graphicsLayer.graphics[graphicIndex];
                    if (checked && !(graphic.symbol && "textsymbol" == graphic.symbol.type)) {
                        //If we're turning on labels, label everything except existing labels (there probably aren't any)
                        var text;
                        switch (graphic.geometry.type) {
                            case "point": {
                                if (graphic.attributes.TITLE) {
                                    text = graphic.attributes.TITLE;
                                }
                                graphicsLayer.add(new Graphic(graphic.geometry, new TextSymbol(text, labelFont, new dojo.Color(configOptions.labelColor))));
                                break;
                            }
                            case "polyline": {
                                if (graphic.attributes.AZIMUTH) {
                                    //Bearing line: use azimuth for text
                                    text = graphic.attributes.AZIMUTH + "°";
                                } else if (graphic.attributes.RANGE) {
                                    //Range ring: use range for text
                                    text = graphic.attributes.RANGE + "m";
                                }
                                if (text) {
                                    //Use middle point
                                    if (0 < graphic.geometry.paths.length) {
                                        var path = graphic.geometry.paths[0];
                                        if (path && 0 < path.length) {
                                            var geom;
                                            if (2 < path.length) {
                                                geom = new Point(path[Math.floor(path.length / 2)], graphic.geometry.spatialReference);
                                            } else {
                                                geom = new Point((path[0][0] + path[1][0]) / 2, (path[0][1] + path[1][1]) / 2, graphic.geometry.spatialReference);
                                            }
                                            var textSymbol = new TextSymbol(text, labelFont, new dojo.Color(configOptions.labelColor));
                                            //Clever hack: the range rings have many more points than the bearing lines typically, so offset them to avoid
                                            //label conflicts.
                                            if (100 < path.length) {
                                                textSymbol.xoffset = 30;
                                                textSymbol.yoffset = -15;
                                            }
                                            graphicsLayer.add(new Graphic(geom, textSymbol));
                                        }
                                    }
                                }
                                break;
                            }
                            case "polygon": {
                                var theText = "Event";
                                var theGraphicsLayer = graphicsLayer;
                                geometryService.labelPoints([ graphic.geometry ], function (labelPoints) {
                                    theGraphicsLayer.add(new Graphic(labelPoints[0], new TextSymbol(theText, labelFont, new dojo.Color(configOptions.labelColor))));
                                });
                                break;
                            }
                        }
                    } else if (!checked && graphic.symbol && "textsymbol" == graphic.symbol.type) {
                        graphicsToRemove.push(graphic);
                    }
                }
                for (var removeIndex = 0; removeIndex < graphicsToRemove.length; removeIndex++) {
                    graphicsLayer.remove(graphicsToRemove[removeIndex]);
                }
            }
        });
    }
}

function downloadLayer(menuItem) {
    var str = layerToJson(menuItem);
    var uri = 'data:text/csv;charset=utf-8,' + str;

    var downloadLink = document.createElement("a");
    downloadLink.href = encodeURI(uri);
    downloadLink.download = menuItem.getParent().currentTarget.innerHTML + ".csv";

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function getOperationalLayerById(layerId) {
    var opLayers = itemInfo.itemData.operationalLayers;
    for (var i = 0; i < opLayers.length; i++) {
        if (opLayers[i].id == layerId) {
            return opLayers[i];
        }
    }
    return null;
}

function layerToJson(menuItem) {
    var layerId = getLayerIdByMenuItem(menuItem);
    var opLayer = getOperationalLayerById(layerId);
    if (null != opLayer) {
        //Get sublayers
        var sublayers = opLayer.featureCollection.layers;
        var fieldNames = [];
        var allFeatures = [];
        for (var sublayerIndex = 0; sublayerIndex < sublayers.length; sublayerIndex++) {
            var sublayer = sublayers[sublayerIndex];
            var fields = sublayer.layerDefinition.fields;
            for (var fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
                var fieldName = fields[fieldIndex].name;
                if (-1 >= fieldNames.indexOf(fieldName)) {
                    //Skip OBJECTID, because there will be duplicates between point, line, and polygon.
                    if ("OBJECTID" != fieldName) {
                        fieldNames.push(fieldName);
                    }
                }
            }
            allFeatures = allFeatures.concat(sublayer.featureSet.features);
        }
        
        var str = "";
        var fieldSep = "";
        var lineSep = "";
        for (var fieldIndex = 0; fieldIndex < fieldNames.length; fieldIndex++) {
            str += fieldSep;
            fieldSep = ",";
            lineSep = "\n";
            var needsCsvQuotes = isNeedsCsvQuotes(fieldNames[fieldIndex]);
            if (needsCsvQuotes) {
                str += "\"";
            }
            str += escapeCsv(fieldNames[fieldIndex]);
            if (needsCsvQuotes) {
                str += "\"";
            }
        }
        str += fieldSep + "GEOMETRY";
        fieldSep = ",";
        str += fieldSep + "LATITUDE" + fieldSep + "LONGITUDE" + fieldSep + "MGRS";
        for (var featureIndex = 0; featureIndex < allFeatures.length; featureIndex++) {
            str += lineSep;
            lineSep = "\n";
            fieldSep = "";
            var feature = allFeatures[featureIndex];
            for (var fieldIndex = 0; fieldIndex < fieldNames.length; fieldIndex++) {
                str += fieldSep;
                fieldSep = ",";
                var value = feature.attributes[fieldNames[fieldIndex]];
                if (undefined != value) {
                    //Make sure "true" and "false" stay that way in the CSV
                    if (true === value) {
                        value = "true";
                    } else if (false === value) {
                        value = "false";
                    }
                    var needsCsvQuotes = isNeedsCsvQuotes(value);
                    if (needsCsvQuotes) {
                        str += "\"";
                    }
                    str += escapeCsv(value);
                    if (needsCsvQuotes) {
                        str += "\"";
                    }
                }
            }
            
            str += fieldSep;
            fieldSep = ",";
            var geomGcs = esri.geometry.webMercatorToGeographic(esri.geometry.fromJson(feature.geometry));
            var geomGcsJson = geomGcs.toJson();
            var geometryString = JSON.stringify(geomGcsJson);
            var needsCsvQuotes = isNeedsCsvQuotes(geometryString);
            if (needsCsvQuotes) {
                str += "\"";
            }
            str += escapeCsv(geometryString);
            if (needsCsvQuotes) {
                str += "\"";
            }
            
            if ("point" == geomGcs.type) {
                var mgrs = org.mymanatee.common.usng.LLtoMGRS(geomGcs.y, geomGcs.x, 5);
                str += fieldSep + geomGcs.y + fieldSep + geomGcs.x + fieldSep + mgrs;
            }
        }
        
        return str;
    }
    return "";
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function isNeedsCsvQuotes(str) {
    if (isNumeric(str)) {
        return false;
    }
    
    var pattern = "[\\n\\r\",]";
    var matches = str.match(pattern);
    return (matches && 0 < matches.length);
}

function escapeCsv(str) {
    if (isNumeric(str)) {
        return str.toString();
    } else {
        return str.replace(/\"/g, "\"\"");
    }
}

function completeDownload() {
    if (USE_DOWNLOADIFY) {
        require(["dijit/registry", "dijit/popup", "dojo/on"], function (registry, popup, on) {
            var layerContextMenu = registry.byId("layerContextMenu");
            var signal = on(layerContextMenu, "onShow", function () {
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

function randomUUID() {
    var s4 = function () {
        return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
    };
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
}
