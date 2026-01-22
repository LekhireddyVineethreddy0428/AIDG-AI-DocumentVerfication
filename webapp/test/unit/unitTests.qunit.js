/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"aidgverification/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
