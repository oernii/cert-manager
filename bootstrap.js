const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

const nsX509CertDB = "@mozilla.org/security/x509certdb;1";
const nsIX509CertDB = Components.interfaces.nsIX509CertDB;
const nsIX509Cert = Components.interfaces.nsIX509Cert;
const nsIFilePicker = Components.interfaces.nsIFilePicker;

// Main code for add-on
var CertManager = {
  onLoad : function(aEvent) {
	//dump(aEvent);
  },

  onUIReady : function(aEvent) {
	//dump(aEvent);
  },

  onUIReadyDelayed : function(aEvent) {
	//dump(aEvent);
  },

  test: function() {
	alert('test OK');
  },

  getCertNumber2: function() {
      var moz_x509certdb2 = Components.classes['@mozilla.org/security/x509certdb;1']
                            .getService(Components.interfaces.nsIX509CertDB2);
      var allCertificates = moz_x509certdb2.getCerts();
      var enumCertificates = allCertificates.getEnumerator();

      var counter = 0;

      while (enumCertificates.hasMoreElements())
      {
        var thisElement = enumCertificates.getNext();
        var thisCertificate = thisElement.QueryInterface(Components.interfaces.nsIX509Cert);

        var DER = thisCertificate.getRawDER({});
	//dump('CN:' + thisCertificate.commonName + ', org:' + thisCertificate.organization + '\n' );
	console.debug(thisCertificate);
        counter++;
      }
      return counter;
  },

  getCertNumber: function() {
      var moz_x509certdb2 = Components.classes['@mozilla.org/security/x509certdb;1']
                            .getService(Components.interfaces.nsIX509CertDB2);
      var allCertificates = moz_x509certdb2.getCerts();
      var enumCertificates = allCertificates.getEnumerator();

      var counter = 0;

      while (enumCertificates.hasMoreElements())
      {
        var thisElement = enumCertificates.getNext();
        var thisCertificate = thisElement.QueryInterface(Components.interfaces.nsIX509Cert);

        var DER = thisCertificate.getRawDER({});
	/*
        this.writeCertificateFile(DER, DER.length, fp.file.path,
                                    counter+1,
                                    thisCertificate.commonName,
                                    thisCertificate.organization);
	*/
	dump('CN:' + thisCertificate.commonName + ', org:' + thisCertificate.organization + '\n' );
	console.debug(thisCertificate);
        counter++;
      }
      return counter;
  },

  importCAcert: function() {
      	//alert ( Services.prefs.getCharPref("extensions.cert-manager.importfile") );
	certdb = Components.classes[nsX509CertDB].getService(nsIX509CertDB);
	//certdb.importCertsFromFile(null, Services.prefs.getCharPref("extensions.cert-manager.importfile"), nsIX509Cert.CA_CERT);

	var filePicker = Components.classes[ "@mozilla.org/filepicker;1" ].createInstance( nsIFilePicker );
  	filePicker.init( window, "Import Certificate",  nsIFilePicker.modeOpen );
  	filePicker.appendFilter( "Certificates", 
			   "*.crt; *.cert; *.cer; *.pem; *.der" );
  	filePicker.appendFilters(nsIFilePicker.filterAll);
  	var result = filePicker.show();

  	if (result == nsIFilePicker.returnOK) {
     	   var theFile = filePicker.file;
           var certDB = Components.classes[ "@mozilla.org/security/x509certdb;1" ]
                     .getService( nsIX509CertDB );

	   certdb.importCertsFromFile(null, theFile, nsIX509Cert.CA_CERT);
	}
	return;
  },

  importUSERcert: function() {
	certdb = Components.classes[nsX509CertDB].getService(nsIX509CertDB);

	var filePicker = Components.classes[ "@mozilla.org/filepicker;1" ].createInstance( nsIFilePicker );
  	filePicker.init( window, "Import Certificate",  nsIFilePicker.modeOpen );
  	filePicker.appendFilter( "Certificates", 
			   "*.crt; *.cert; *.cer; *.pem; *.der" );
  	filePicker.appendFilters(nsIFilePicker.filterAll);
  	var result = filePicker.show();

  	if (result == nsIFilePicker.returnOK) {
     	   var theFile = filePicker.file;
           var certDB = Components.classes[ "@mozilla.org/security/x509certdb;1" ]
                     .getService( nsIX509CertDB );

	   //certdb.importCertsFromFile(null, theFile, nsIX509Cert.CA_CERT);
	   certdb.importPKCS12File(null, theFile);
	}
	return;
  },

};


function isNativeUI() {
  let appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
  return (appInfo.ID == "{aa3c5121-dab2-40e2-81ca-7ea25febc110}");
}

function showToast(aWindow) {
  aWindow.NativeWindow.toast.show("Showing you a toast", "short");
}

function showDoorhanger(aWindow) {
  window = aWindow;
  buttons = [
    {
      label: "Import USER certificate",
      callback: function() {
        //aWindow.NativeWindow.toast.show("Button 1 was tapped", "short");
	LOG("Cert: Import CertManager.importUSERcert() button");
	CertManager.importUSERcert();
      }
    } , {
      label: "Import CA certificate",
      callback: function() {
        //aWindow.NativeWindow.toast.show("Button 2 was tapped", "short");
        LOG("Cert: CertManager.importCAcert() button");
	CertManager.importCAcert();
      }
    }];

  aWindow.NativeWindow.doorhanger.show("Select which certificate you wish to impor to firefox", "cert-import", buttons);
}

function copyLink(aWindow, aTarget) {
  let url = aWindow.NativeWindow.contextmenus._getLinkURL(aTarget);
  aWindow.NativeWindow.toast.show("Todo: copy > " + url, "short");
}

var gToastMenuId = null;
var gDoorhangerMenuId = null;
var gContextMenuId = null;

function loadIntoWindow(window) {
  LOG('Cert: loadIntoWindow');
  if (!window)
    return;

  if (isNativeUI()) {
    LOG('Cert: loadIntoWindow-isNativeUI');
    //gToastMenuId = window.NativeWindow.menu.add("Show Toast", null, function() { showToast(window); });
    gDoorhangerMenuId = window.NativeWindow.menu.add("Cert-Manager Options", null, function() { showDoorhanger(window); });
    //gContextMenuId = window.NativeWindow.contextmenus.add("Copy Link", window.NativeWindow.contextmenus.linkOpenableContext, function(aTarget) { copyLink(window, aTarget); });
  }
}

function unloadFromWindow(window) {
  if (!window)
    return;

  if (isNativeUI()) {
    window.NativeWindow.menu.remove(gToastMenuId);
    window.NativeWindow.menu.remove(gDoorhangerMenuId);
    window.NativeWindow.contextmenus.remove(gContextMenuId);
  }
}


/**
 * bootstrap.js API
 */
var windowListener = {
  onOpenWindow: function(aWindow) {
    LOG('Cert: windowListener-onOpenWindow');
    // Wait for the window to finish loading
    let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    domWindow.addEventListener("load", function() {
      domWindow.removeEventListener("load", arguments.callee, false);
      loadIntoWindow(domWindow);
    }, false);
  },
  
  onCloseWindow: function(aWindow) {
  },
  
  onWindowTitleChange: function(aWindow, aTitle) {
  }
};

function LOG(msg) {
  var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                 .getService(Components.interfaces.nsIConsoleService);
  consoleService.logStringMessage(msg);
};

function startup(aData, aReason) {
  LOG('Cert: startup');
  let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

  // Load into any existing windows
  let windows = wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    loadIntoWindow(domWindow);
  }

  // Load into any new windows
  wm.addListener(windowListener);
}

function shutdown(aData, aReason) {
  LOG('Cert: shutdown');
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (aReason == APP_SHUTDOWN)
    return;

  let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

  // Stop listening for new windows
  wm.removeListener(windowListener);

  // Unload from any existing windows
  let windows = wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }
}

function install(aData, aReason) {
  LOG('Cert: install');
}

function uninstall(aData, aReason) {
  LOG('Cert: uninstall');
}
