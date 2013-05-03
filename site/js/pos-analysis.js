/**
 * Try to put all configuration settings here.
 */
var configOptions = {
    webmapTitle: "Position Analysis Web Map",
    webmapExtent: "70.3685, 34.3767, 70.546, 34.4962",
    portalUrl: "https://afmlocomport.esri.com",
    sharingPath: "/sharing/content/items",
    proxyRequired: true,
    proxyUrl: "/proxy.jsp"
}

var map;
var portal;
var itemInfo;
var user;

require([
    "dijit/layout/BorderContainer",
    "dijit/layout/ContentPane",
    "dijit/layout/AccordionContainer",
    "dijit/form/ComboBox",
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
    "dojo/on",
    "dojo/json",
    "dojo/domReady!"],
function (BorderContainer, ContentPane, AccordionContainer, ComboBox, ToggleButton, Uploader, Flash, NumberTextBox, CheckBox, Select, InlineEditBox, NumberSpinner, Menu, MenuItem, Map, ArcGISTiledMapServiceLayer, IdentityManager, Portal, utils, on, JSON) {
    console.log("Welcome to Position Analysis Web, using Dojo version " + dojo.version);
    
    esri.arcgis.utils.arcgisUrl = configOptions.portalUrl + configOptions.sharingPath;
    if (configOptions.proxyRequired) {
        esri.config.defaults.io.proxyUrl = configOptions.proxyUrl;
    }
    
    portal = new esri.arcgis.Portal(configOptions.portalUrl);            

    //Setup the file upload widget
    require([],
    function (FlashOrIFrame) {
        var uploader = new dojox.form.Uploader({
            label: "Select files",
            multiple: true,
            uploadOnSelect: true,
            url: "UploadFile.php",
        }, "addPointsUploader");
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
                    try {
                        var xhrPromise = xhr("defaultWebMapItemData.json", {
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
                    } catch (ex) {
                        console.error("xhr error: " + ex);
                        //TODO tell the user it isn't going to work out?
                    }
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
        itemInfo = response.itemInfo;
        if (itemInfo && itemInfo.itemData && itemInfo.itemData.operationalLayers) {
            require(["dijit/registry", "dojo/dom-construct", "dijit/InlineEditBox", "dijit/form/TextBox"], function (registry, domConstruct, InlineEditBox, TextBox) {
                var layerListWidget = registry.byId("layerList");
                var layerListDomElement = dojo.byId("layerList");
                var layerContextMenu = registry.byId("layerContextMenu");
                var layers = itemInfo.itemData.operationalLayers;
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
                }
            });
        }
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
                console.log("saveWebMap success!");
                callback(data.id);
            }, function (error) {
                console.log("saveWebMap error: " + error);
            }, function (evt) {
                
            });
        } catch (ex) {
            console.error("saveWebMap xhr error: " + ex);
        }
    });
}
