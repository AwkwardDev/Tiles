const CONTROL_GROUP = '<div class="control-group"> \
	<div class="controls site-controls"> \
		<a type="button" class="btn disabled handle"><i class="icon-list"></i></a> \
		<span class="url input-large uneditable-input"></span> \
		<input type="text" class="input-nano abbreviation" placeholder="" maxlength="2"> \
		<div class="action-buttons"> \
			<a type="button" class="btn btn-danger remove"><i class="icon-trash icon-white"></i></a> \
		</div> \
	</div> \
</div>';

const NO_TILES_ADDED_TEXT = "No tiles added.";

const SUBMIT_BUTTON_SAVING_TEXT = "Saving&hellip;";
const SUBMIT_BUTTON_SUBMIT_TEXT = "Save";

const FAVICON_LOAD_FAIL_TITLE = "Failed to retrieve favicon!";
const FAVICON_LOAD_FAIL_URL_REPLACE = "#{url}";
const FAVICON_LOAD_FAIL_MESSAGE = "Could not retrieve favicon for #{url}. Check the URL and ensure the site does not redirect.";

$(document).ready(function() {
	chrome.storage.sync.remove("sites");

	chrome.storage.sync.get(null, function(items) {
		console.log(items);
	});

	var sites = [];

	sitesReload();

	chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
		console.log('Message received: ' + request.message);

		if (request.message == "saved" || request.message == "deleted") {
			sitesReload();
		}
	});

	function sitesReload() {	
		getSites(function (items) {
			$("#sites").html("");
			
			if (!items || items.length == 0) {
				$("#sites").prepend(NO_TILES_ADDED_TEXT);
			} else {
				sites = items;

				sites = sites.reverse();

				for (var i = 0; i < sites.length; i++) {
					var newControlGroup = CONTROL_GROUP;
					var site = sites[i];

					newControlGroup = $(newControlGroup);
					newControlGroup.find('span.url').html(site.url);
					newControlGroup.find('input.abbreviation').val(site.abbreviation);
					newControlGroup.find('a.remove').on('click', function(e) {
						removeControlGroup(e.target);
					});

					$("#sites").prepend(newControlGroup);
				}
			}

			$("#sites").sortable({
				handle: '.handle',
				axis: 'y',
				update: function(e, ui) {
					movedControlGroup(ui);
				}
			});

			$(".container").removeClass("hidden");
		});
	}

	function movedControlGroup(ui) {
		makeSites();

		chrome.extension.sendMessage({ message: "saved" }, function(response) { });
	}

	function removeControlGroup(element) {
		parent = $(element).parents('.control-group');

		chrome.extension.sendMessage({ message: "delete", url:parent.find('span.url').html() }, function(response) { });
	}

	function makeSites() {
		var fields = [];
 
		$('#sites .site-controls').each(function(index, element) {
			urlField = $(this).children('span.url').eq(0);
			abbreviationField = $(this).children('input:text.abbreviation').eq(0);
 
			var url = urlField.html();
			var abbreviation = abbreviationField.val();
 
			if (!url.match(/^(http|https):\/\//)) {
				url = "http://" + url;
 
				urlField.html(url);
			}
 
			if (!abbreviation) {
				abbreviation = makeAbbreviation(getHostname(url));
 
				abbreviationField.val(abbreviation);
			}
 
			fields[index] = {};
			fields[index].url = url;
			fields[index].abbreviation = abbreviation;
		});
 
		var numberOfSitesRequiringColor = fields.length;
 
		const TIME_BEFORE_UPDATE = 1000 * 60 * 60;
 
		getSites(function(sites) {
			for (var i = 0; i < fields.length; i++) {
				fields[i].color = null;
			}
 
			if (sites != null && sites.length != 0) {
				for (var i = 0; i < sites.length; i++) {
					for (var j = 0; j < fields.length; j++) {
						if (sites[i].url == fields[j].url) {
							if (siteNeedsColorUpdate(sites[i])) {
								fields[j].color = null;
							} else {
								fields[j].color = sites[i].color;
								fields[j].lastUpdated = sites[i].lastUpdated;
 
								numberOfSitesRequiringColor--;
							}
						}
					}
				}
			}
 
			console.log(Math.min(numberOfSitesRequiringColor, 0) + " sites require a color check");
 
			var siteSaved = false;
 
			for (var i = 0; i < fields.length; i++) {
				(function() {
					var site = fields[i];
 
					if (site.color != null) {
						if (!siteSaved && numberOfSitesRequiringColor <= 0) {
							saveSites(fields);
 
							siteSaved = true;
						}
					} else {
						setSiteColor(site, function(site, error) {
							if (error) {
								$(".alert-error").removeClass("hidden");
								$(".alert-error").children("span").html(FAVICON_LOAD_FAIL_MESSAGE.replace(FAVICON_LOAD_FAIL_URL_REPLACE, site.url));
								$(".alert-error").children("h4").html(FAVICON_LOAD_FAIL_TITLE);
							}
 
							numberOfSitesRequiringColor--;
 
							console.log((fields.length - numberOfSitesRequiringColor) + " / " + fields.length + " – Got color for " + site.url);
 
							if (!siteSaved && numberOfSitesRequiringColor <= 0) {
								saveSites(fields);
 
								siteSaved = true;
							}
						});
					}
				})();
			}

			return sites;
		});	
	}
});