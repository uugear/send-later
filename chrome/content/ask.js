function Sendlater3AskDonate() {
    var localeService = Components
	.classes["@mozilla.org/intl/nslocaleservice;1"]
        .getService(Components.interfaces.nsILocaleService);
    var locale = localeService.getLocaleComponentForUserAgent();
    var url = "https://addons.mozilla.org/" + locale +
	"/thunderbird/addon/195275/contribute/?src=send-ask";
    var protocolSvc = Components
	.classes["@mozilla.org/uriloader/external-protocol-service;1"]
        .getService(Components.interfaces.nsIExternalProtocolService);
    var uri = Components.classes["@mozilla.org/network/io-service;1"]
	.getService(Components.interfaces.nsIIOService)
        .newURI(url, null, null);
    protocolSvc.loadURI(uri);
    // -1 == already donated, -2 == stop asking
    Sendlater3Util.PrefService.setIntPref("extensions.sendlater3.ask.sent", -1);
    window.close();
}

function Sendlater3AskRemind() {
    // Preferences were already updated when window was popped up.
    window.close();
}

function Sendlater3AskAlready() {
    // -1 == already donated, -2 == stop asking
    Sendlater3Util.PrefService.setIntPref("extensions.sendlater3.ask.sent", -1);
    window.close();
}

function Sendlater3AskStop() {
    // -1 == already donated, -2 == stop asking
    Sendlater3Util.PrefService.setIntPref("extensions.sendlater3.ask.sent", -2);
    window.close();
}

Sendlater3Util.initUtil();