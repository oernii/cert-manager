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

/*
*/
// Setup the main event listeners
window.addEventListener("load", function(e) {
  CertManager.onLoad(e);
}, false);

window.addEventListener("UIReady", function(e) {
  CertManager.onUIReady(e);
}, false);

window.addEventListener("UIReadyDelayed", function(e) {
  CertManager.onUIReadyDelayed(e);
}, false);

