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
      var moz_x509certdb2 = CC['@mozilla.org/security/x509certdb;1']
                            .getService(CI.nsIX509CertDB2);
      var allCertificates = moz_x509certdb2.getCerts();
      var enumCertificates = allCertificates.getEnumerator();

      var counter = 0;

      while (enumCertificates.hasMoreElements())
      {
        var thisElement = enumCertificates.getNext();
        var thisCertificate = thisElement.QueryInterface(CI.nsIX509Cert);

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

  getCertNumber: function() {
      var moz_x509certdb2 = CC['@mozilla.org/security/x509certdb;1']
                            .getService(CI.nsIX509CertDB2);
      var allCertificates = moz_x509certdb2.getCerts();
      var enumCertificates = allCertificates.getEnumerator();

      var counter = 0;

      while (enumCertificates.hasMoreElements())
      {
        var thisElement = enumCertificates.getNext();
        var thisCertificate = thisElement.QueryInterface(CI.nsIX509Cert);

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

