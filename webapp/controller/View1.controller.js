sap.ui.define([
    "sap/ui/core/mvc/Controller",
    'sap/m/MessageToast',
    "sap/ui/model/json/JSONModel"
], (Controller, MessageToast, JSONModel) => {
    "use strict";

    return Controller.extend("aidgverification.controller.View1", {
        onInit() {
            this.api = "https://airdoc-normal.cfapps.ap10.hana.ondemand.com/post_image/";
        },

        onBeforeRendering: function () {
            this._ReadAiConfig();
        },

        _ReadAiConfig: function () {
            let oModel = this.getOwnerComponent().getModel();
            let that = this;

            oModel.read('/ZC_QU_DG_AICONTROL', {
                success: function (oData) {
                    let oMap = {};
                    oData.results.forEach(item => { oMap[item.ServiceType] = item; });
                    let oJsonModel = new JSONModel(oMap);
                    that.getView().setModel(oJsonModel, "aiConfigLocal");

                    // AUTO-SWITCH: If PAN is hidden, select the first visible tab
                    var oTabHeader = that.byId("mainTabHeader");
                    var aItems = oTabHeader.getItems();
                    var sCurrentKey = oTabHeader.getSelectedKey();

                    // Check if current tab is visible
                    var oCurrentTab = aItems.find(i => i.getKey() === sCurrentKey);
                    if (!oCurrentTab || !oCurrentTab.getVisible()) {
                        var oNextTab = aItems.find(i => i.getVisible() === true);
                        if (oNextTab) {
                            oTabHeader.setSelectedKey(oNextTab.getKey());
                            that._updateUIForTab(oNextTab.getKey());
                        } else {
                            // Hide content if nothing is enabled
                            that.byId("MainContentSection").setVisible(false);
                        }
                    } else {
                        that._updateUIForTab(sCurrentKey);
                    }
                },
                error: function () {
                    console.error("Config load failed.");
                }
            });
        },

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key") || oEvent.getParameter("selectedKey");
            this._updateUIForTab(sKey);

            // UI Reset
            this._selectedFile = null;
            this.byId("fileUploader").clear();
            this.byId("Preview").setVisible(false).setSrc("");
            this.byId("PdfPreviewHtml").setVisible(false).setContent("");
            this.byId("resultText").setHtmlText("Results will appear here...");
        },

        _updateUIForTab: function (sKey) {
            var oTitle = this.byId("VerificationTitle");
            var oButton = this.byId("VerificationButton");

            var mConfig = {
                "5": { title: "💳 PAN Verification", btn: "Click to Verify PAN" },
                "4": { title: "👤 Aadhaar Verification", btn: "Click to Verify Aadhaar" },
                "7": { title: "💵 Bank Cheque Verification", btn: "Click to Verify Cheque" },
                "1": { title: "🧾 Invoice Data Extraction", btn: "Click to Verify Invoice" },
                "8": { title: "📝 Contract Data Extraction", btn: "Click to Verify Contract" }
            };

            var oSettings = mConfig[sKey] || { title: "Verification", btn: "Verify Now" };
            oTitle.setText(oSettings.title);
            oButton.setText(oSettings.btn);
        },

        onFileChange: function (oEvent) {
            const oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;
            this._selectedFile = oFile;

            if (oFile.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.byId("Preview").setSrc(e.target.result).setVisible(true);
                    this.byId("PdfPreviewHtml").setVisible(false);
                };
                reader.readAsDataURL(oFile);
            } else if (oFile.type === "application/pdf") {
                const sUrl = URL.createObjectURL(oFile);
                this.byId("PdfPreviewHtml").setContent(`<iframe src="${sUrl}" width="100%" height="330px" style="border:none;"></iframe>`).setVisible(true);
                this.byId("Preview").setVisible(false);
            }
        },

        onVerifyPress: async function () {
            if (!this._selectedFile) {
                return MessageToast.show("Please upload a file first");
            }

            const appId = this.byId("mainTabHeader").getSelectedKey();
            const formData = new FormData();
            formData.append("file", this._selectedFile, this._selectedFile.name);
            formData.append("app_id", appId);
            formData.append("token", 'DP0xxRLQswtQeEuFUEfcQP9Otcsg7XFzUIhG4pFzuBeUYDmRqd2gTbI4fOYIPeGZ')
            this.getView().setBusy(true);

            try {
                const response = await fetch(this.api, { method: "POST", body: formData });
                const data = await response.json();

                // Get result text
                let sRawResult = (data.success && typeof data.success === "object")
                    ? JSON.stringify(data.success, null, 2)
                    : data.success;

                // Use marked to format markdown
                let html = marked.parse(sRawResult || "");

                // Set directly (no custom formatter)
                this.byId("resultText").setHtmlText(html);

            } catch (err) {
                this.byId("resultText").setHtmlText("Verification failed.");
            } finally {
                this.getView().setBusy(false);
            }
        },
    });
});