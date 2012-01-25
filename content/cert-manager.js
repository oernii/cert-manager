/**
 * The main namespace class for the FireFound service.
 *
 * @author chris
 */

var CertManager = {
	/**
	 * Whether debug mode is turned on. Used mostly to control logging.
	 */
	debug : true,
	
	/**
	 * Whether this instance of the service is active.
	 * This whole thing should really be replaced with a component that runs in the background,
	 * but I've run into some issues with that because of the broken geolocation support in Firefox.
	 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=493615
	 */
	active : false,
	
	/**
	 * Reference for this object's geolocation listener entry.
	 */
	watchId : null,
	
	/**
	 * Flag to disable the pref observer in various instances.
	 */
	loadingSettings : false,
	
	/**
	 * Hold the user's password in memory so that they're not prompted for the master password
	 * multiple times per browsing session if they're using it.
	 */
	password : null,
	
	/**
	 * Holds the preferences service after initialization.
	 */
	prefs : null,
	
	/**
	 * A timer we use to delay sending preferences to the server, since the observer is triggered
	 * after every keystroke in Fennec.
	 */
	prefObserverTimeout : null,
	
	/**
	 * Lazy strings getter.
	 */
	
	strings : {
		_backup : null,
		_main : null,

		initStrings : function () {
			if (!this._backup) { this._backup = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://cert-manager-default-locale/content/locale.properties"); }
			if (!this._main) { this._main = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://cert-manager/locale/locale.properties"); }
		},

		getString : function (key) {
			this.initStrings();

			var rv = "";

			try {
				rv = this._main.GetStringFromName(key);
			} catch (e) {
			}

			if (!rv) {
				try {
					rv = this._backup.GetStringFromName(key);
				} catch (e) {
				}
			}

			return rv;
		},

		getFormattedString : function (key, args) {
			this.initStrings();

			var rv = "";

			try {
				rv = this._main.formatStringFromName(key, args, args.length);
			} catch (e) {
			}

			if (!rv) {
				try {
					rv = this._backup.formatStringFromName(key, args, args.length);
				} catch (e) {
				}
			}

			return rv;
		}
	},
	
	/**
	 * Returns the current FireFound username.
	 */
	get account() { return CertManager.prefs.getCharPref("username"); },
	
	lastUpdate : 0,
	
	/**
	 * Service initializer.
	 * 
	 * @param boolean bareBones Whether to load just the bare minimum to use this object.
	 */
	load : function (bareBones) {
		CertManager.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.test2.");
		CertManager.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		CertManager.prefs.addObserver("", CertManager, false);
		
		/**
		 * A bare-bones initialization would be for something like options dialog in Firefox
		 */
		if (!bareBones) {
			// Check if there's already a window running with the FireFound service.
			var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator); 
			var enumerator = wm.getEnumerator(null);  
			
			while (enumerator.hasMoreElements()) {
				var win = enumerator.getNext();
				
				if ((win != window) && (win.CertManager && win.CertManager.active)) {
					return;
				}
			}
			
			CertManager.active = true;
			
			var wifi_service = Components.classes["@mozilla.org/wifi/monitor;1"].getService(Components.interfaces.nsIWifiMonitor);
			wifi_service.startWatching(CertManager);
			
			// Register with the geolocation service.
			
			var geolocation = Components.classes["@mozilla.org/geolocation;1"].getService(Components.interfaces.nsIDOMGeoGeolocation);
			CertManager.watchId = geolocation.watchPosition(CertManager.enhanceLocationData, CertManager.locationError);
			
			// If there's no account associated with this profile, prompt the user for one.
			if (!CertManager.account) {
				setTimeout(function () { CertManager.getAccount(); }, 5000);
			}
			else {
				CertManager.getPreferencesForFennec();
			}
			
			if (document.getElementById("addons-list")) {
				document.getElementById("addons-list").addEventListener("AddonOptionsLoad", CertManager.mobileOptionsLoad, false);
			}
			
			setTimeout(CertManager.showUpgradePage, 3000);
		}
	},
	
	/**
	 * Cleans up loose ends.
	 */
	unload : function () {
		/**
		 * If this is an active instance, check for other windows and active one of them.
		 */
		
		CertManager.prefs.removeObserver("", CertManager);
		
		if (CertManager.active) {
			CertManager.active = false;
			
			var geolocation = Components.classes["@mozilla.org/geolocation;1"].getService(Components.interfaces.nsIDOMGeoGeolocation);
			geolocation.clearWatch(CertManager.watchId);
			
			var wifi_service = Components.classes["@mozilla.org/wifi/monitor;1"].getService(Components.interfaces.nsIWifiMonitor);
			wifi_service.stopWatching(CertManager);
			
			CertManager.accessPoints = [];
			
			if (document.getElementById("addons-list")) {
				document.getElementById("addons-list").removeEventListener("AddonOptionsLoad", CertManager.mobileOptionsLoad, false);
			}
			
			/**
			 * Pass the torch to any other non-active FireFound-enabled window.
			 */
			var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator); 
			var enumerator = wm.getEnumerator(null);  
			
			while (enumerator.hasMoreElements()) {
				var win = enumerator.getNext();
				
				if (win != window && win.CertManager && !win.CertManager.active) {
					win.CertManager.load();
					return;
				}
			}
		}
	},
	
	getVersion : function (callback) {
		var addonId = "cert-manager@efinke.com";
		
		if ("@mozilla.org/extensions/manager;1" in Components.classes) {
			// < Firefox 4
			var version = Components.classes["@mozilla.org/extensions/manager;1"]
				.getService(Components.interfaces.nsIExtensionManager).getItemForID(addonId).version;
			
			callback(version);
		}
		else {
			// Firefox 4.
			Components.utils.import("resource://gre/modules/AddonManager.jsm");  
			
			AddonManager.getAddonByID(addonId, function (addon) {
				callback(addon.version);
			});
		}
	},
	
	showUpgradePage : function () {
		if (!CertManager.prefs.getCharPref("version")) {
			// Firstrun is handled after account creation.
			CertManager.getVersion(function (v) {
				CertManager.prefs.setCharPref("version", v);
			});
		}
		else {
			function isMajorUpdate(version1, version2) {
				if (version1 != version2) {
					return true;
				}
				
				var oldParts = version1.split(".");
				var newParts = version2.split(".");
	
				if (newParts[0] != oldParts[0] || newParts[1] != oldParts[1]) {
					return true;
				}
			
				return false;
			}
		
			function doShowFirstRun(version) {
				function doShowUpgradePage(version) {
					if (typeof Browser != 'undefined') {
						// Fennec
						Browser.addTab(CertManager.prefs.getCharPref("host") + "/upgrade/"+version+"/", true);
					}
					else {
						// Firefox
						var browser = getBrowser();
						browser.selectedTab = browser.addTab(CertManager.prefs.getCharPref("host") + "/upgrade/"+version+"/");
					}
				}
				
				if (isMajorUpdate(CertManager.prefs.getCharPref("version"), version)) {
					var username = CertManager.account;
					
					if (!CertManager.account) {
						doShowUpgradePage(version);
						return;
					}
					else {
						var password = CertManager.getPassword(username);
						
						if (!password) {
							doShowUpgradePage(version);
							return;
						}
						else {
							var json = {
								"username" : username,
								"password" : password
							};
							
							json = JSON.stringify(json);
						
							var req = new XMLHttpRequest();
							req.open("POST", CertManager.prefs.getCharPref("host") + "/api/ping.json", true);
						
							req.setRequestHeader("Content-Type", "application/json");
							req.setRequestHeader("Content-Length", json.length);
							
							req.onreadystatechange = function () {
								if (req.readyState == 4) {
									if (CertManager.prefs.getBoolPref("debug")) {
										CertManager.log("ping: " + req.responseText);
									}
									
									doShowUpgradePage(version);
								}
							};
							
							if (CertManager.prefs.getBoolPref("debug")) {
								CertManager.log("ping in code: " + json);
							}
							
							req.send(json);
						}
					}
				}
				
				CertManager.prefs.setCharPref("version", version);
			}
		
			CertManager.getVersion(doShowFirstRun);
		}
	},
	
	showFirstRun : function () {
		if (typeof Browser != 'undefined') {
			// Fennec
			Browser.addTab(CertManager.prefs.getCharPref("host") + "/firstrun/", true);
		}
		else {
			// Firefox
			var browser = getBrowser();
			browser.selectedTab = browser.addTab(CertManager.prefs.getCharPref("host") + "/firstrun/");
		}
	},
	
	mobileOptionsLoad : function () {
		if (document.getElementById("cert-manager-retrieve-passwords")) {
			document.getElementById("cert-manager-retrieve-passwords").style.display = 'none';
			
			if (CertManager.prefs.getBoolPref("fennec.premium.retrievePasswords")) {
				document.getElementById("cert-manager-retrieve-passwords").style.display = '';
			}
		}
	},
	
	/**
	 * Returns a reference to the active Firefound object, or false if none are found.
	 *
	 * @return boolean
	 */
	
	getActiveFireFound : function () {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator); 
		var enumerator = wm.getEnumerator(null);  
		
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			
			if (win.CertManager && win.CertManager.active) {
				return win.CertManager;
			}
		}
		
		return false;
	},
	
	/**
	 * Preference observer, used only for Fennec, but will probably be used for Firefox eventually anyway.
	 * We delay the actual observer code because it fires after every keystroke in Fennec.
	 * 
	 * @param string subject
	 * @param string topic The event being observed.
	 * @param string data In our case, the preference that was changed.
	 */
	observe : function(subject, topic, data) {
		clearTimeout(CertManager.prefObserverTimeout);
		CertManager.prefObserverTimeout = setTimeout(function (subject, topic, data) { CertManager.prefChange(subject, topic, data); }, 1000, subject, topic, data);
	},
	
	/**
	 * The callback function for the wifi listener.
	 *
	 * @param array accessPoints A list of WiFi access ponts.
	 */
	
	accessPoints : [],
	
	onChange : function (accessPoints) {
		CertManager.accessPoints = [];
		
		var _length = accessPoints.length;
		
		if (_length > 0) {
			for (var i = 0; i < _length; i++) {
				// Include each wifi access point and its strength.
				CertManager.accessPoints.push(
					{
						"mac_address" : accessPoints[i].mac,
						"signal_strength": accessPoints[i].signal,
						"age": 0,
						"ssid": accessPoints[i].ssid
					}
				);
			}
		}
	},
	
	/**
	 * Error callback for the WiFi listener.
	 */ 
	onError : function (value) {
		var geolocation = Components.classes["@mozilla.org/geolocation;1"].getService(Components.interfaces.nsIDOMGeoGeolocation);
		
		// User does not have WiFi interface.
		CertManager.onChange([]);
	},
	
	QueryInterface: function(iid) {  
		if (iid.equals(Components.interfaces.nsIWifiListener) ||  
			iid.equals(Components.interfaces.nsISupports)) {
			return this;
		}
		
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	
	/**
	 * Preference observer, used only for Fennec, but will probably be used for Firefox eventually anyway.
	 *
	 * @param string subject
	 * @param string topic The event being observed.
	 * @param string data In our case, the preference that was changed.
	 */
	
	prefChange : function (subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		if (CertManager.active && !CertManager.loadingSettings) {
			var preferences = null;
			
			switch(data) {
				case "fennec.emailAddress":
					var preferences = {
						"email" : CertManager.prefs.getCharPref("fennec.emailAddress")
					};
				break;
				case "fennec.miles":
					var preferences = {
						"miles" : CertManager.prefs.getIntPref("fennec.miles")
					};
				break;
				case "fennec.protection.history":
				case "fennec.protection.downloads":
				case "fennec.protection.formdata":
				case "fennec.protection.cache":
				case "fennec.protection.offlineApps":
				case "fennec.protection.passwords":
				case "fennec.protection.cookies":
				case "fennec.protection.sessions":
				case "fennec.protection.siteSettings":
					var preferences = {
						"data_protection" : {
							"history" : CertManager.prefs.getBoolPref("fennec.protection.history"),
							"passwords" : CertManager.prefs.getBoolPref("fennec.protection.passwords"),
							"downloads" : CertManager.prefs.getBoolPref("fennec.protection.downloads"),
							"cookies" : CertManager.prefs.getBoolPref("fennec.protection.cookies"),
							"formdata" : CertManager.prefs.getBoolPref("fennec.protection.formdata"),
							"sessions" : CertManager.prefs.getBoolPref("fennec.protection.sessions"),
							"cache" : CertManager.prefs.getBoolPref("fennec.protection.cache"),
							"siteSettings" : CertManager.prefs.getBoolPref("fennec.protection.siteSettings"),
							"offlineApps" : CertManager.prefs.getBoolPref("fennec.protection.offlineApps")
						}
					};
				break;
				case "fennec.premium.retrievePasswords":
				/*
					if (CertManager.prefs.getBoolPref("fennec.premium.retrievePasswords")) {
						document.getElementById("cert-manager-retrieve-passwords").style.display = '';
					}
					else {
						document.getElementById("cert-manager-retrieve-passwords").style.display = 'none';
					}
					*/
				break;
			}
			
			if (preferences) {
				/**
				 * Update the setting on the server. 
				 */
				CertManager.sendPreferences(preferences);
			}
		}
	},
	
	/**
	 * Checks if the environment is Fennec, and if so, retrieves the settings from the server.
	 */
	
	getPreferencesForFennec : function () {
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		
		if (appInfo.ID == '{a23983c0-fd0e-11dc-95ff-0800200c9a66}') {
			// This is Fennec.
			
			function callback(rv) {
				CertManager.loadingSettings = true;
				
				if (!rv.email) rv.email = "";
				
				CertManager.prefs.setCharPref("fennec.emailAddress", rv.email);
				CertManager.prefs.setIntPref("fennec.miles", rv.miles);
				CertManager.prefs.setBoolPref("fennec.protection.history", rv.data_protection.history);
				CertManager.prefs.setBoolPref("fennec.protection.passwords", rv.data_protection.passwords);
				CertManager.prefs.setBoolPref("fennec.protection.downloads", rv.data_protection.downloads);
				CertManager.prefs.setBoolPref("fennec.protection.cookies", rv.data_protection.cookies);
				CertManager.prefs.setBoolPref("fennec.protection.formdata", rv.data_protection.formdata);
				CertManager.prefs.setBoolPref("fennec.protection.sessions", rv.data_protection.sessions);
				CertManager.prefs.setBoolPref("fennec.protection.cache", rv.data_protection.cache);
				CertManager.prefs.setBoolPref("fennec.protection.siteSettings", rv.data_protection.siteSettings);
				CertManager.prefs.setBoolPref("fennec.protection.offlineApps", rv.data_protection.offlineApps);
				
				var premium = rv.premium;
				var payload = rv.payload;
				
				CertManager.prefs.setBoolPref("fennec.premium.retrievePasswords", false);
				
				if (premium && payload) {
					CertManager.prefs.setBoolPref("fennec.premium.retrievePasswords", true);
				}
				
				CertManager.loadingSettings = false;
			}
			
			CertManager.getPreferences(callback);
		}
	},
	
	/**
	 * Initialization for the settings dialog in Firefox.
	 */
	getPreferencesForFirefox : function () {
		// Code to load the preference data for the full-blown settings window in Firefox.
		
		function callback(rv) {
			document.getElementById("loading").style.visibility = "hidden";
			document.getElementById("controls").style.visibility = "visible";
			
			if ("msg" in rv) {
				if ("code" in rv && rv.code == "ERROR_NO_ACCOUNT") {
					CertManager.getActiveFireFound().getAccount();
					window.close();
				}
				else {
					alert(rv.msg);
				}
			}
			else {
				var email = rv.email
				var miles = rv.miles;
				var edp = rv.data_protection;
				
				var premium = rv.premium;
				var payload = rv.payload;
				
				document.getElementById("email").value = email;
				document.getElementById("miles").value = miles;
				
				document.getElementById("edp_history").checked = edp.history;
				document.getElementById("edp_passwords").checked = edp.passwords;
				document.getElementById("edp_downloads").checked = edp.downloads;
				document.getElementById("edp_cookies").checked = edp.cookies;
				document.getElementById("edp_formdata").checked = edp.formdata;
				document.getElementById("edp_sessions").checked = edp.sessions;
				document.getElementById("edp_cache").checked = edp.cache;
				document.getElementById("edp_siteSettings").checked = edp.siteSettings;
				document.getElementById("edp_offlineApps").checked = edp.offlineApps;
				
				if (!premium || !payload) {
					document.getElementById("retrieve-payload").style.display = 'none';
				}
				
				if (premium) {
					document.getElementById("premium-notice").style.display = 'none';
				}
			}
		}
		
		CertManager.getPreferences(callback);
	},
	
	/**
	 * Prompt the user to choose a username and password (or supply an existing pair).
	 * 
	 * @param function successCallback The callback to call when all is said and done with this function.
	 * @param function errorCallback The error callback.
	 */
	getAccount : function (successCallback, errorCallback) {
		CertManager.password = null;
		
		var re = [ CertManager.account ];
		
		window.openDialog("chrome://cert-manager/content/registration.xul", "cert-manager-registration", "chrome,modal,centerscreen,resizable=no", re);
		
		if (!re[0]) {
			if (errorCallback) {
				errorCallback();
			}
			else {
				// Don't bug the user for the rest of this window's session.
				CertManager.unload();
			}
		}
		else {
			var username = re[0];
			var password = re[1];
			
			// Post the auth pair to the FireFound service.
			var json = {
				username : username,
				password : password
			};
		
			json = JSON.stringify(json);
		
			var req = new XMLHttpRequest();
			req.open("POST", CertManager.prefs.getCharPref("host") + "/api/account.json", true);
		
			req.setRequestHeader("Content-Type", "application/json");
			req.setRequestHeader("Content-Length", json.length);
		
			req.onreadystatechange = function () {
				if (req.readyState == 4) {
					if (CertManager.prefs.getBoolPref("debug")) {
						CertManager.log("getAccount: " + req.responseText);
					}
					
					if (req.status == 200) {
						CertManager.showFirstRun();
						
						// Success: Save this username and password.
						CertManager.prefs.setCharPref("username", username.toLowerCase());
						CertManager.setPassword(username.toLowerCase(), password);
						
						// Request the current location as a baseline.
						if (CertManager.watchId) {
							var geolocation = Components.classes["@mozilla.org/geolocation;1"].getService(Components.interfaces.nsIDOMGeoGeolocation);
							
							geolocation.getCurrentPosition(
								function (position) { 
									CertManager.enhanceLocationData(position); 
								},
								function (error) {
									CertManager.locationError(error);
								}
							);
						}
						
						if (successCallback) {
							successCallback();
						}
						
						/**
						 * In case this is Fennec, download the current settings.
						 */
						CertManager.getPreferencesForFennec();
					}
					else {
						// Could be an invalid username or incorrect password.
						try {
							var rv = JSON.parse(req.responseText);
							
							alert(rv.msg);
						} catch (e) {
							CertManager.log(e + ": " + req.responseText);
						}
						
						// Try again.
						CertManager.getAccount(successCallback, errorCallback);
					}
				}
			};
		
			req.send(json);
		}
	},
	
	/**
	 * Retrieves user preferences from the server and populates the settings form.
	 * 
	 * @param function callback The function that is called with the preferences retrieved from the server.
	 */
	
	getPreferences : function (callback) {
		var username = CertManager.account;
		
		if (!CertManager.account) {
			CertManager.getAccount(function () { CertManager.getPreferences(); }, function () { window.close(); });
			return;
		}
		
		var password = CertManager.getPassword(username);
		
		if (!password) {
			CertManager.getAccount(function () { CertManager.getPreferences(); }, function () { window.close(); });
			return;
		}
		
		var json = {
			username : username,
			password : password
		};
	
		json = JSON.stringify(json);
	
		var req = new XMLHttpRequest();
		req.open("POST", CertManager.prefs.getCharPref("host") + "/api/preferences.json", true);
	
		req.setRequestHeader("Content-Type", "application/json");
		req.setRequestHeader("Content-Length", json.length);
	
		req.onreadystatechange = function () {
			if (req.readyState == 4) {
				if (callback) {
					try {
						var rv = JSON.parse(req.responseText);
					} catch (e) {
						CertManager.log(e + ": " + req.responseText);
					}
					
					if (callback) {
						callback(rv);
					}
				}
			}
		};
	
		req.send(json);
	},
	
	/**
	 * Saves user preference changes to the server (called from settings.xul)
	 *
	 * @return boolean Returns false to prevent the dialog from closing before the request completes.
	 */
	
	setPreferences : function () {
		document.getElementById("loading").selectedIndex = 1;
		document.getElementById("loading").style.visibility = "visible";
		
		var preferences = {
			"email" : document.getElementById("email").value,
			"miles" : document.getElementById("miles").value,
			"data_protection" : {
				"history" : document.getElementById("edp_history").checked,
				"passwords" : document.getElementById("edp_passwords").checked,
				"downloads" : document.getElementById("edp_downloads").checked,
				"cookies" :document.getElementById("edp_cookies").checked,
				"formdata" :document.getElementById("edp_formdata").checked,
				"sessions" :document.getElementById("edp_sessions").checked,
				"cache" :document.getElementById("edp_cache").checked,
				"siteSettings" :document.getElementById("edp_siteSettings").checked,
				"offlineApps" :document.getElementById("edp_offlineApps").checked,
			}
		};
	
		function callback () { window.close(); };
		
		CertManager.sendPreferences(preferences, callback);
		
		return false;
	},
	
	/**
	 * Updates the settings on the FireFound server.
	 * 
	 * @param dict preferences The preferences to send to the server.
	 * @param function callback The callback after the request completes.
	 */
	
	sendPreferences : function (preferences, callback) {
		// Both of these were set when the dialog loaded.
		var username = CertManager.account;
		var password = CertManager.getPassword(username);
		
		var json = {
			username : username,
			password : password,
			preferences : preferences
		};
		
		json = JSON.stringify(json);
	
		var req = new XMLHttpRequest();
		req.open("POST", CertManager.prefs.getCharPref("host") + "/api/preferences.json", true);
		
		req.setRequestHeader("Content-Type", "application/json");
		req.setRequestHeader("Content-Length", json.length);
	
		req.onreadystatechange = function () {
			if (req.readyState == 4) {
				if (callback) {
					callback();
				}
			}
		};
	
		req.send(json);
	},
	
	/**
	 * Saves the chosen username/password pair to the login manager.
	 *
	 * @param string The chosen username.
	 * @param string The chosen password.
	 */
	
	setPassword : function (username, password) {
		CertManager.password = password;
		
		// Everything done with the username is lower-cased.
		username = username.toLowerCase();
		
		// TODO Centralize this code.
		var loginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		var url = CertManager.prefs.getCharPref("host") + "/";
		
		var logins = loginManager.findLogins({}, url, "chrome://cert-manager", null);
		
		for (var j = 0; j < logins.length; j++) {
			loginManager.removeLogin(logins[j]);
		}
		
		var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1", Components.interfaces.nsILoginInfo, "init");
		var loginInfo = new nsLoginInfo(url, 'chrome://cert-manager', null, username, password, "", "");
		loginManager.addLogin(loginInfo);
	},
	
	/**
	 * Retrieve the FireFound password for the given username.
	 *
	 * @param string The username.
	 * @return string/bool The password, or false on failure.
	 */
	
	getPassword : function (username) {
		if (CertManager.password) {
			return CertManager.password;
		}
		
		var loginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1", Components.interfaces.nsILoginInfo, "init");
		
		var hostname = CertManager.prefs.getCharPref("host") + "/";
		var formSubmitURL = "chrome://cert-manager";
		
		var logins = loginManager.findLogins({}, hostname, formSubmitURL, null);
		
		for (var i = 0; i < logins.length; i++) {
			CertManager.password = logins[i].password;
			return logins[i].password;
		}
		
		return false;
	},
	
	enhanceLocationData : function (location) {
		var eLocation = {};
		
		eLocation.accuracy = location.coords.accuracy;
		eLocation.latitude = location.coords.latitude;
		eLocation.longitude = location.coords.longitude;
		eLocation.wifi_towers = CertManager.accessPoints;
		eLocation.address = {
			"streetNumber": location.address.streetNumber,
			"street": location.address.street,
			"city": location.address.city,
			"region": location.address.region,
			"postalCode": location.address.postalCode
		};
		
		CertManager.newLocation(eLocation);
	},
	
	/**
	 * The new location callback for the geolocation service.
	 *
	 * @param hash The new location data.
	 */
	
	newLocation : function (location) {
		if (CertManager.debug) {
			CertManager.log("newLocation in code: " + location.toSource());
		}
		
		var lastUpdate = CertManager.lastUpdate;
		var now = (new Date()).getTime();
		
		if ((now - lastUpdate) < (1000 * 60 * 30)) {
			// Only send server pings every 30 minutes.
			return;
		}
		
		CertManager.lastUpdate = new Date().getTime();
		
		var username = CertManager.account;
		
		if (!CertManager.account) {
			return;
		}
		
		var password = CertManager.getPassword(username);
		
		if (!password) {
			CertManager.getAccount();
			return;
		}
		
		// Ping it out to the FireFound server.
		
		var json = {
			"username" : username,
			"password" : password,
			"location" : location
		};
		
		json.location = CertManager_CRYPT.encrypt(JSON.stringify(json.location), password);
		json.encrypted = true;
		
		json = JSON.stringify(json);
		
		var req = new XMLHttpRequest();
		req.open("POST", CertManager.prefs.getCharPref("host") + "/api/location.json", true);
		
		req.setRequestHeader("Content-Type", "application/json");
		req.setRequestHeader("Content-Length", json.length);
		
		req.onreadystatechange = function () {
			if (req.readyState == 4) {
				if (CertManager.prefs.getBoolPref("debug")) {
					CertManager.log("newLocation: " + req.responseText);
				}
				
				if (req.status == 200) {
					if (req.responseText) {
						// The only thing right now that would be in the response is a killswitch activation.
						try {
							var rv = JSON.parse(req.responseText);
						} catch (e) {
							CertManager.log(e + ": " + req.responseText);
						}
						
						if (rv.killswitch) {
							// Get a password.
							CertManager.threaten(rv.killswitch_fields, rv.premium);
						}
					}
				}
				else {
					// Some error occurred.
					try {
						var rv = JSON.parse(req.responseText);
					} catch (e) {
						CertManager.log(e + ": " + req.responseText);
					}
					
					if ("code" in rv && rv.code == "ERROR_NO_ACCOUNT") {
						// Disable the add-on.  The user has either closed their account,
						// or they haven't been active in 60 days.
						if ("@mozilla.org/extensions/manager;1" in Components.classes) {
							Components.classes["@mozilla.org/extensions/manager;1"]
								.getService(Components.interfaces.nsIExtensionManager)
								.disableItem("cert-manager@efinke.com");
						
							CertManager.prefs.setCharPref("username", "");
						
							CertManager.getActiveFireFound().unload();
						}
					}
				}
			}
		};
		
		req.send(json);
	},
	
	/**
	 * Threaten to clear all data if the password is not entered.
	 * 
	 * @param array[string] fields The types of data that will be cleared on failure.
	 */
	
	threaten : function (fields, premium) {
		var re = [];
		
		// The code in threat.xul takes care of closing after 30 seconds.
		window.openDialog("chrome://cert-manager/content/threat.xul", "threat", "chrome,modal,centerscreen,resizable=no", re);
		
		if (!re[0]) {
			CertManager.abortAbort(fields);
		}
		else {
			// Confirm that the password is correct.
			var username = re[0].toLowerCase();
			var password = re[1];
		
			if (username != CertManager.account || password != CertManager.getPassword(username)) {
				CertManager.abortAbort(fields);
			}
			else {
				// Ping the FireFound server and clear the killswitch.
				var json = {
					"username" : username,
					"password" : password,
					"preferences" : {
						"killswitch": false
					}
				};

				json = JSON.stringify(json);

				var req = new XMLHttpRequest();
				req.open("POST", CertManager.prefs.getCharPref("host") + "/api/preferences.json", true);
				req.setRequestHeader("Content-Type", "application/json");
				req.setRequestHeader("Content-Length", json.length);

				req.onreadystatechange = function () {
					if (req.readyState == 4) {
						if (CertManager.prefs.getBoolPref("debug")) {
							CertManager.log("Threaten: " + req.responseText);
						}
					}
				};
				
				req.send(json);
			}
		}
	},
	
	/**
	 * Clear out all private data.
	 * 
	 * @param array[string] fields The types of data that will be cleared.
	 */
	
	abortAbort : function (fields, premium) {
		// Save the username/password so that FireFound can continue to act as a locater beacon.
		var username = CertManager.account;
		var password = CertManager.getPassword(username);
		
		var json = {
			"username" : username,
			"password" : password,
			"activated": true
		};
		
		if (premium) {
			json.payload = {
				"version": "1.0"
			};
		}
		
		var san = new Sanitizer();
		
		for (var i = 0; i < fields.length; i++) {
			var field = fields[i];
			
			if (premium) {
				switch (field) {
					case "passwords":
						var myLoginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
						var logins = myLoginManager.getAllLogins({});
						json.payload.passwords = logins;
					break;
				}
			}
			
			san.clearItem(field);
			
			if (field == "passwords") {
				// Reset the FireFound username/password so we can continue to track location.
				CertManager.setPassword(username, password);
			}
		}
		
		json = JSON.stringify(json);
		
		var req = new XMLHttpRequest();
		req.open("POST", CertManager.prefs.getCharPref("host") + "/api/killswitch.json", true);
		req.setRequestHeader("Content-Type", "application/json");
		req.setRequestHeader("Content-Length", json.length);
		
		req.onreadystatechange = function () {
			if (req.readyState == 4) {
				// Shut down.
				var appStartup = Components.classes['@mozilla.org/toolkit/app-startup;1'].getService(Components.interfaces.nsIAppStartup);
				appStartup.quit(Components.interfaces.nsIAppStartup.eForceQuit);
			}
		};
		
		req.send(json);
	},
	
	/**
	 * Retrieves and saves a KML file of the user's locations.
	 */
	
	downloadLocations : function () {
		if (document.getElementById("loading")) {
			// Show the "Retrieving data" loader.
			document.getElementById("loading").selectedIndex = 2;
			document.getElementById("loading").style.visibility = 'visible';
		}
		
		// Save the username/password so that FireFound can continue to act as a locater beacon.
		var username = CertManager.account;
		var password = CertManager.getPassword(username);
		
		var json = {
			"username" : username,
			"password" : password,
		};
		
		json = JSON.stringify(json);
		
		var req = new XMLHttpRequest();
		req.open("POST", CertManager.prefs.getCharPref("host") + "/api/download.json", true);
		req.setRequestHeader("Content-Type", "application/json");
		req.setRequestHeader("Content-Length", json.length);
		
		req.onreadystatechange = function () {
			if (req.readyState == 4) {
				// Prompt the user to save it.
				var data = req.responseText;
				
				var nsIFilePicker = Components.interfaces.nsIFilePicker;
				var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
				fp.init(window, CertManager.strings.getString("cert-manager.download.title"), nsIFilePicker.modeSave);

				fp.appendFilter(CertManager.strings.getString("cert-manager.download.kml"), "*.kml");
				fp.appendFilter(CertManager.strings.getString("cert-manager.download.all"), "*");
				
				fp.defaultString = CertManager.strings.getString("cert-manager.download.filename") + ".kml";
				
				var result = fp.show();

				if (result != nsIFilePicker.returnCancel){
					var file = fp.file;
					
					var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].getService(Components.interfaces.nsIScriptableUnicodeConverter);
					converter.charset = 'UTF-8';
					data = converter.ConvertFromUnicode(data);

					var outputStream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);

					outputStream.init(file, 0x04 | 0x08 | 0x20, 420, 0 );
					outputStream.write(data, data.length);
					outputStream.close();
				}
				
				if (document.getElementById("loading")) {
					document.getElementById("loading").style.visibility = 'hidden';
				}
			}
		};
		
		req.send(json);
	},
	
	/**
	 * Error callback for geolocation service.
	 *
	 * @param string The error string.
	 */
	
	locationError : function (error) {
		if (CertManager.prefs.getBoolPref("debug")) {
			CertManager.log("locationError: " + error);
		}
	},
	
	retrievePayload : function () {
		if (!confirm(CertManager.strings.getString("cert-manager.payload.explanation"))) {
			return;
		}
		
		var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		                        .getService(Components.interfaces.nsIPromptService);
		
		while (true) {
			username = { value: CertManager.account };
			password = { value: "" };
			check = { value: false };
			okorcancel = prompts.promptUsernameAndPassword(window, CertManager.strings.getString("cert-manager.payload.authenticateTitle"), CertManager.strings.getString("cert-manager.payload.authenticateDescription"), username, password, null, check);
		
			if (!okorcancel || !password.value) {
				return;
			}
			else if (username.value == CertManager.account && password.value == CertManager.getPassword(username)) {
				break;
			}
			else {
				alert(CertManager.strings.getString("cert-manager.payload.authenticateFailure"));
			}
		}
		
		// Request the username and password.
		
		var username = CertManager.account;
		var password = CertManager.getPassword(username);
		
		var json = {
			"username" : username,
			"password" : password,
		};
		
		json = JSON.stringify(json);
		
		var req = new XMLHttpRequest();
		req.open("POST", CertManager.prefs.getCharPref("host") + "/api/payload.json", true);
		req.setRequestHeader("Content-Type", "application/json");
		req.setRequestHeader("Content-Length", json.length);
		
		req.onreadystatechange = function () {
			if (req.readyState == 4) {
				try {
					var payload = JSON.parse(req.responseText);
				} catch (e) {
					CertManager.log(e + ": " + req.responseText);
				}
				
				for (var i in payload) {
					switch (i) {
						case "passwords":
							var passwords = payload[i];
							
							var myLoginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
							
							for (var j = 0; j < passwords.length; j++) {
								var login = Components.classes["@mozilla.org/login-manager/loginInfo;1"].createInstance(Components.interfaces.nsILoginInfo);
								
								for (var attr in passwords[j]) {
									login[attr] = passwords[j][attr];
								}
								
								try {
									myLoginManager.addLogin(login);
								} catch (e) {
									// Already exists.
								}
							}
						break;
					}
				}
				
				alert(CertManager.strings.getString("cert-manager.payload.success"));
				
				if (document.getElementById("retrieve-payload")) {
					document.getElementById("retrieve-payload").style.display = 'none';
				}
				else if (document.getElementById("cert-manager-retrieve-passwords")) {
					document.getElementById("cert-manager-retrieve-passwords").style.display = 'none';
				}
			}
		};
		
		req.send(json);
	},
	
	/**
	 * Log a message to the Error Console.
	 *
	 * @param string message
	 */
	
	log : function (message) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage("CertManager: " + message);
	},
		
	testuj : function () {
		alert('test');
	},
};
