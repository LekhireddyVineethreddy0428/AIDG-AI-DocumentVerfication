sap.ui.define([
    "sap/ui/core/mvc/Controller",
    'sap/m/MessageToast',
    "sap/ui/model/json/JSONModel"
], (Controller, MessageToast, JSONModel) => {
    "use strict";

    return Controller.extend("aidgverification.controller.View1", {
        onInit() {
            this.api = "https://airdoc-test.cfapps.ap10.hana.ondemand.com/post_image/";
        },

        onFileChange: function (oEvent) {
            const oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;
            this._selectedFile = oFile;
            this.byId('previewPlaceholder')?.setVisible(false);
            if (oFile.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.byId("Preview").setSrc(e.target.result).setVisible(true);
                    this.byId("PdfPreviewHtml").setVisible(false);
                };
                reader.readAsDataURL(oFile);
            } else if (oFile.type === "application/pdf") {
                const sUrl = URL.createObjectURL(oFile);
                this.byId("PdfPreviewHtml").setContent(`<iframe src="${sUrl}" width="620px" height="550px" style="border:none;"></iframe>`).setVisible(true);
                this.byId("Preview").setVisible(false);
            }
        },

        onVerifyPress: async function () {
            if (!this._selectedFile) {
                sap.m.MessageToast.show("Please upload a file first");
                return;
            }
            const appId = "10";
            const formData = new FormData();
            formData.append("file", this._selectedFile, this._selectedFile.name);
            formData.append("app_id", appId);
            formData.append("token", "DP0xxRLQswtQeEuFUEfcQP9Otcsg7XFzUIhG4pFzuBeUYDmRqd2gTbI4fOYIPeGZ");

            this.getView().setBusy(true);

            try {

                const response = await fetch(this.api, {
                    method: "POST",
                    body: formData
                });

                const data = await response.json();
                this.jsonData = data

                let html = "";
                const formatValue = function (val) {

                    if (val === null || val === undefined || val === "") {
                        return '<span style="color:#94a3b8;font-style:italic;">—</span>';
                    }

                    if (typeof val === "boolean") {
                        return marked.parse(val ? "✅ True" : "❌ False");
                    }

                    if (typeof val === "number") {
                        return marked.parse(String(val));
                    }

                    if (typeof val === "string") {
                        return marked.parse(val);
                    }

                    if (Array.isArray(val)) {

                        const md = val.map(function (item) {

                            if (typeof item === "object") {
                                return "- " + JSON.stringify(item, null, 2);
                            }

                            return "- " + String(item);

                        }).join("\n");

                        return marked.parse(md);
                    }

                    if (typeof val === "object") {

                        const md = Object.entries(val)
                            .map(function ([k, v]) {

                                if (typeof v === "object") {
                                    return `**${k}:** ${JSON.stringify(v)}`;
                                }

                                return `**${k}:** ${v}`;

                            })
                            .join("\n\n");

                        return marked.parse(md);
                    }

                    return marked.parse(String(val));
                };

                if (data.success) {

                    const summary = data.success.document_summary || "";
                    const fieldsArray = data.success.key_fields || [];

                    html += `<h3>Document Summary</h3>`;
                    html += `<div>${marked.parse(summary)}</div>`;

                    if (fieldsArray.length) {

                        html += `<h3>Key Fields</h3>`;
                        html += `<table style="width:100%;border-collapse:collapse;border:1px solid #ccc;">`;

                        fieldsArray.forEach(function (fields) {

                            for (const key in fields) {

                                html += `
                        <tr>
                            <td style="border:1px solid #ccc;padding:8px;font-weight:bold;width:35%">
                                ${key}
                            </td>
                            <td style="border:1px solid #ccc;padding:8px">
                                ${formatValue(fields[key])}
                            </td>
                        </tr>`;
                            }
                        });
                        html += `</table>`;
                    }
                } else {
                    html = `<p>Verification failed.</p>`;
                }
                this.byId("resultsPlaceholder")?.setVisible(false);
                this.byId("resultText")?.setVisible(true);
                this.byId("exportBtn")?.setVisible(true);
                this.byId("resultText").setContent(html);

            } catch (err) {
                this.byId("resultsPlaceholder").setVisible(false);
                this.byId("resultText").setVisible(true);
                this.byId("resultText").setContent("<p>Verification failed.</p>");

            } finally {

                this.getView().setBusy(false);

            }

        },
        onExportJson: function () {
            var sContent = this.jsonData;
            var oData = {
                extractionResult: sContent
            };

            var sJson = JSON.stringify(oData, null, 2);
            var blob = new Blob([sJson], { type: "application/json" });
            var url = URL.createObjectURL(blob);

            var a = document.createElement("a");
            a.href = url;
            a.download = "results.json";
            a.click();

            URL.revokeObjectURL(url);
        },
        onClearPress: function () {
            this.byId("fileUploader")?.clear();
            this.byId("Preview")?.setVisible(false).setSrc("");
            this.byId("PdfPreviewHtml")?.setVisible(false).setContent("");
            this.byId("previewPlaceholder")?.setVisible(true);
            this.byId("resultText")?.setVisible(false).setContent("");
            this.byId("resultsPlaceholder")?.setVisible(true);
            this.byId("exportBtn")?.setVisible(false);
            this.byId('previewPlaceholder')?.setVisible(true);
            this.jsonData = '';
            this._selectedFile = '';
        }
    });
});