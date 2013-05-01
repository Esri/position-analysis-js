/**
 * Try to put all configuration settings here.
 */
var configOptions = {
    webmap: "537d73deafbd4b4ead7155ac5fc7348e",
    portalUrl: "https://afmlocomport.esri.com",
    sharingPath: "/sharing/content/items",
    proxyRequired: true,
    proxyUrl: "/proxy.jsp"
}

var map;
var portal;
var itemInfo;

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
        //Create the map, based on a Web map
        var mapDeferred = esri.arcgis.utils.createMap(configOptions.webmap, "map", {
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
            //saveWebMap(response.itemInfo.item, response.itemInfo.itemData, loggedInUser);
        }, function(error){
            console.error('Create Map Failed: ' , dojo.toJson(error));
            //TODO this might be a bad item ID or something else. Tell the user.
        });
    }, function (error) {
        console.error("Couldn't sign in: " + error);
        //TODO this isn't a bad username/password. It's more fundamental than that, like a bad
        //     portal URL or even a bad portal. Tell the user.
    });
}

function saveWebMap(item, itemData, loggedInUser) {
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
    var xhrArgs = {
        url: loggedInUser.userContentUrl.replace("/sharing/rest/content/users/", "/sharing/content/users/") + "/addItem?f=json&token=" + loggedInUser.credential.token,
        token: loggedInUser.credential.token,
        content: cont,
        handleAs: "text",
        headers: {
            "X-Requested-With": null
        },
        load: function (data) {
            data = dojo.fromJson(data);
            if (data.success == true) {
                console.log('Updated item data!');
            } else { console.error('Failed to update item data!'); }
        },
        error: function (error) {
            console.error(error);
        }
    };
    console.log(xhrArgs);
    dojo.xhrPost(xhrArgs);
}
