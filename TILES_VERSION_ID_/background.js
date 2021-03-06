function init() {
	console.log("Tiles background page started");

	chrome.windows.getLastFocused({ populate: true }, function(window) {
		updateWindow(window);
	});

	migrateStorage();

	// Set the version if not done already
	storageVersionExists(function(exists) {
		if (!exists) {
			setStorageVersion(getExtensionVersion());
		}
	});

	writeUserStylesheet();
}

chrome.tabs.onActivated.addListener(function(info) {
	chrome.tabs.get(info.tabId, function(tab) {
		updateTab(tab);
	});
});

chrome.tabs.onUpdated.addListener(function(tabID, changeInfo, tab) {
	if (tab.active) {
		updateTab(tab);
	}
});

chrome.windows.onFocusChanged.addListener(function(windowID) {
	if (windowID == -1) {
		return;
	}

	chrome.windows.get(windowID, { populate: true }, function(window) {
		updateWindow(window);
	});
});

chrome.contextMenus.removeAll(function() {
	chrome.contextMenus.create({
	    "title": "Tiles Options",
	    "documentUrlPatterns": [chrome.extension.getURL("/") + "*"],
	    "contexts": ["page", "link"],
	    "onclick" : function() {
	    	goToOptionsPage(true)
	    }
	});
});

function goToOptionsPage(newTab) {
	var optionsURL = chrome.extension.getURL("/TILES_VERSION_ID_/options/options.html");

	if (newTab) {
		chrome.tabs.create({
			url: optionsURL
		});
	} else {
		chrome.tabs.getCurrent(function(tab) {
			chrome.tabs.update(tab.id, { url : optionsURL })
		});
	}
}

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	console.log('Message received: ' + request.message);

	if (request.message == "getUrl") {
		getFocusedTab(function(tab) {
			if (tab) {
				sendResponse({ url: tab.url });

				console.log('Sent URL - ' + tab.url);
			}
		});
	} else if (request.message == "getAbbreviation") {
		getFocusedTab(function(tab) {
			if (tab) {
				getSiteAbbreviationForURL(tab.url, function(abbreviation) {
					sendResponse({ abbreviation: abbreviation });

					console.log('Sent abbreviation - ' + abbreviation);
				});
			}
		});
	} else if (request.message == "setAbbreviation") {
		getFocusedTab(function(tab) {
			if (tab) {
				getIDForURL(tab.url, function(id) {
					updateSiteAbbreviation(id, request.abbreviation, function(response) {
						sendResponse({ message: "success" });

						console.log('Setting abbreviation of ' + tab.url + ' to ' + request.abbreviation);

						updateAllWindows();
					});
				});
			}
		});
	} else if (request.message == "delete") {
		console.log('Deleting...');

		getFocusedTab(function(tab) {
			if (!tab) {
				return;
			}

			function deleteSiteCallback() {
				if (!request.url) {
					setPopup(true, false, tab.id);
					changeIcon(false, null, tab.id);
				}

				sendResponse({ message: "deleted" });

				console.log('Sent deleted');

				updateAllWindows();
			}

			if (request.url == undefined) {
				console.log("Deleting site " + tab.url);
				getIDForURL(tab.url, function(id) {
					removeSites([id], deleteSiteCallback);
				});
			} else {
				console.log("Deleting site " + request.url);
				getIDForURL(request.url, function(id) {
					removeSites([id], deleteSiteCallback);
				});
			}
		});
	} else if (request.message == "save") {
		console.log('Saving...');

		getFocusedTab(function(tab) {
			createSite(tab.url, request.abbreviation, null, function(site) {
				addSites([site], function() {
					updateAllWindows();

					sendResponse({ message: "saved" });

					console.log('Sent saved');
				});
			});
		});
	} else if (request.message == "openTab") {
		chrome.tabs.create({
			url: request.url
		});

		sendResponse({ message: "opened" });
	} else if (request.message == SITES_ADDED_MESSAGE
		|| request.message == SITES_REMOVED_MESSAGE) {
		writeUserStylesheet();
	}

	return true;
});

function getFocusedTab(callback) {
	chrome.windows.getLastFocused({ populate: true }, function(window) {
		if (window && window.type != 'normal') {
			return callback(null);
		}

		var tabs = window.tabs;

		for (var j = 0; j < tabs.length; j++) {
			if (tabs[j].active) {
				return callback(tabs[j]);
			}
		}
	});
}

function setPopup(save, error, tabID) {
	var details = {};

	if (error) {
		details.popup = '/TILES_VERSION_ID_/browser_action/error.html';
	} else {
		if (save) {
			details.popup = '/TILES_VERSION_ID_/browser_action/save.html';
		} else {
			details.popup = '/TILES_VERSION_ID_/browser_action/delete.html';
		}
	}

	details.tabId = tabID;

	chrome.browserAction.setPopup(details);
}

/**
 * Updates all of the windows.
 */
function updateAllWindows() {	
	chrome.windows.getAll({ populate: true }, function(windows) {
		console.log('Updating all windows...');

		for (var i = 0; i < windows.length; i++) {
			updateWindow(windows[i]);
		}
	});
}

/**
 * Updates all of the tabs in a window.
 * @param  {Window} window The window to update all of its tabs.
 */
function updateWindow(window) {
	if (window && window.type == 'normal') {
		var tabs = window.tabs;

		for (var i = 0; i < tabs.length; i++) {
			if (tabs[i].active) {
				updateTab(tabs[i]);

				break;
			}
		}
	}
}

/**
 * Sets the appropriate popup and icon for the tab.
 * @param  {Tab} tab The tab to update its popup and icon.
 */
function updateTab(tab) {
	if (isChromeURL(tab.url)) {
		setPopup(false, true, tab.id);

		changeIcon(false, null, tab.id);
	} else {
		siteExistsWithURL(tab.url, function(exists) {
			setPopup(!exists, false, tab.id);

			changeIcon(exists, null, tab.id);
		});
	}
}

/**
 * Sets the icon for the browser action in the chrome toolbar.
 * @param {boolean} color If {true}, icon will be set to color
 *     version, else icon will be set to grayscale version.
 * @param callback The callback to call after the icon has
 *     been set.
 * @param tabID The related tab ID.
 */
function changeIcon(color, callback, tabID) {
	var details = {};

	if (color) {
		details.path = '/TILES_VERSION_ID_/icons/icon-bitty.png';
	} else {
		details.path = '/TILES_VERSION_ID_/icons/icon-bitty-gray.png';
	}

	details.tabId = tabID;

	chrome.browserAction.setIcon(details, callback);
}

init();