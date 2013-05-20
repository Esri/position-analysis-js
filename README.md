position-analysis-js
====================

Position Analysis Web template

## Setup

The Position Analysis Web template uses Portal for ArcGIS 10.2+ or ArcGIS Online. You'll need the portal URL
in order to set up the application.

You must deploy the Web application on a HTTPS-enabled Web server, or else the login to Portal or ArcGIS Online
will not work.

If using [the ArcGIS proxy page](http://developers.arcgis.com/en/javascript/jshelp/ags_proxy.html),
and if the Portal certificate is self-signed or issued by a non-standard certificate authority (CA), you have to configure
the Web server that is hosting the proxy page to trust the certificate and/or CA. The directions for this vary based on which
proxy page you choose--ASP.NET, Java, or PHP. (For example, for the Java proxy page, you must use the JDK's keytool to add the
CA root certificate to the trust store of the JRE that runs your Web server.) Directions are available on the Web for various
platforms and Web servers.

Deploy the [site](site) directory as a Web application in your HTTPS-enabled Web server with a context name of your choice.
Open [site/js/pos-analysis.js](site/js/pos-analysis.js) in a text editor and edit the variables at the top of the file as necessary:

- webmapTitle: the title of the expected Web map. If the user does not own a Web map with that title,
               a Web map with that title will be created.
- webmapExtent: the initial extent for a Web map created by this application.
- portalUrl: the Portal for ArcGIS URL.
- sharingPath: a relative path such that portalUrl + sharingPath is the full sharing URL for the portal.
- proxyRequired: true if the ArcGIS API for JavaScript needs to use a proxy and false otherwise.
                 A proxy is required when hosting the application on a different domain than Portal
                 for ArcGIS and may be required in other situations. Read
                 [the proxy page documentation](http://developers.arcgis.com/en/javascript/jshelp/ags_proxy.html)
                 for further details.
- proxyUrl: the relative or absolute URL to the proxy page.

Open index.html and edit the ArcGIS API for JavaScript URLs, including the JavaScript link and the CSS links. If using
Portal for ArcGIS, you should use the ArcGIS API for JavaScript included with the portal.

## Licensing

Copyright 2012 Esri

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

A copy of the license is available in the repository's
[license.txt](license.txt) file.

Note: Portions of this code use USNG which is licensed under the MIT License.
See [license-ThirdParty.txt](license-ThirdParty.txt) for the details 
of this license.