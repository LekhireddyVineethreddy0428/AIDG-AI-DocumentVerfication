sap.ui.define([
    "sap/ui/core/mvc/Controller",
    'sap/m/MessageToast',
    "sap/ui/model/json/JSONModel"
], (Controller, MessageToast, JSONModel) => {
    "use strict";

    return Controller.extend("aidgverification.controller.View1", {
        onInit() {
            this.tokenUrl = "https://airdoc.cfapps.ap10.hana.ondemand.com/token";
            this.apiUrl = "https://airdoc.cfapps.ap10.hana.ondemand.com/post_image/";
            this._abortController = null;
            this._pdfBlobUrl = null;
            this._selectedFile = null;
            this.jsonData = null;
            this._accessToken = null;
            this._tokenType = null;
            this._tokenExpiry = null;

            var oViewModel = new JSONModel({
                previewPlaceholderVisible: true,
                imagePreviewVisible: false,
                pdfPreviewVisible: false,
                resultsPlaceholderVisible: true,
                resultTextVisible: false,
                exportBtnVisible: false,
                previewSrc: "",
                pdfContent: "",
                resultContent: "",
                isAuthenticating: false,
                authenticationStatus: ""
            });
            this.getView().setModel(oViewModel, "view");
            this.getAccessToken();
        },

        getAccessToken: async function (bForceRefresh = false) {
            if (!bForceRefresh && this._accessToken && this._tokenExpiry && this._tokenExpiry > Date.now()) {
                return { token: this._accessToken, type: this._tokenType };
            }

            var oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/isAuthenticating", true);
            oViewModel.setProperty("/authenticationStatus", "Authenticating...");

            try {
                const formData = new FormData();
                formData.append("username", "Airdit");
                formData.append("password", "Airdit@123");

                const response = await fetch(this.tokenUrl, { method: "POST", body: formData });
                if (!response.ok) throw new Error(`Authentication failed: ${response.status}`);

                const data = await response.json();
                this._accessToken = data.token || data.access_token || data;
                this._tokenType = data.type || data.token_type || "Bearer";
                this._tokenExpiry = Date.now() + (60 * 60 * 1000);

                oViewModel.setProperty("/authenticationStatus", "Authenticated successfully");
                //MessageToast.show("Authentication successful");
                return { token: this._accessToken, type: this._tokenType };

            } catch (err) {
                console.error("Authentication error:", err);
                oViewModel.setProperty("/authenticationStatus", `Authentication failed: ${err.message}`);
               // MessageToast.show(`Authentication failed: ${err.message}`);
                return null;
            } finally {
                oViewModel.setProperty("/isAuthenticating", false);
            }
        },

        onFileChange: function (oEvent) {
            const oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;

            if (this._pdfBlobUrl) {
                URL.revokeObjectURL(this._pdfBlobUrl);
                this._pdfBlobUrl = null;
            }
            if (this._abortController) {
                this._abortController.abort();
                this._abortController = null;
            }

            this._selectedFile = oFile;
            var oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/previewPlaceholderVisible", false);

            if (oFile.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    oViewModel.setProperty("/imagePreviewVisible", true);
                    oViewModel.setProperty("/pdfPreviewVisible", false);
                    oViewModel.setProperty("/previewSrc", e.target.result);
                    this.byId("Preview").setSrc(e.target.result).setVisible(true);
                    this.byId("PdfPreviewHtml").setVisible(false);
                };
                reader.readAsDataURL(oFile);
            } else if (oFile.type === "application/pdf") {
                this._pdfBlobUrl = URL.createObjectURL(oFile);
                var sPdfContent = `<iframe src="${this._pdfBlobUrl}" width="640px" height="550px" style="border:none;"></iframe>`;
                oViewModel.setProperty("/pdfPreviewVisible", true);
                oViewModel.setProperty("/imagePreviewVisible", false);
                oViewModel.setProperty("/pdfContent", sPdfContent);
                this.byId("PdfPreviewHtml").setContent(sPdfContent).setVisible(true);
                this.byId("Preview").setVisible(false);
            }
        },

        onVerifyPress: async function () {
            if (!this._selectedFile) {
                MessageToast.show("Please upload a file first");
                return;
            }

            if (this._abortController) this._abortController.abort();
            this._abortController = new AbortController();

            var oViewModel = this.getView().getModel("view");
            this.getView().setBusy(true);
            oViewModel.setProperty("/authenticationStatus", "Verifying document...");

            try {
                const authData = await this.getAccessToken();
                if (!authData || !authData.token) throw new Error("Failed to obtain access token");

                const formData = new FormData();
                formData.append("file", this._selectedFile, this._selectedFile.name);
                formData.append("app_id", "10");

                const response = await fetch(this.apiUrl, {
                    method: "POST",
                    headers: { "Authorization": `${authData.type} ${authData.token}` },
                    body: formData,
                    signal: this._abortController.signal
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        const newAuthData = await this.getAccessToken(true);
                        if (newAuthData && newAuthData.token) {
                            const retryResponse = await fetch(this.apiUrl, {
                                method: "POST",
                                headers: { "Authorization": `${newAuthData.type} ${newAuthData.token}` },
                                body: formData,
                                signal: this._abortController.signal
                            });
                            if (!retryResponse.ok) throw new Error(`API call failed after token refresh: ${retryResponse.status}`);
                            const data = await retryResponse.json();
                            await this.processResponse(data);
                        } else {
                            throw new Error("Failed to refresh token");
                        }
                    } else {
                        throw new Error(`API call failed: ${response.status}`);
                    }
                } else {
                    const data = await response.json();
                    await this.processResponse(data);
                }

            } catch (err) {
                var errorHtml = `
                    <div style="color:#dc2626;background:#fef2f2;padding:20px;border-radius:8px;text-align:center;box-sizing:border-box;">
                        <h3 style="margin:0 0 8px 0;">⚠️ Verification Failed</h3>
                        <p style="margin:0 0 8px 0;">${err.message || 'Unknown error'}</p>
                        <p style="font-size:12px;margin:0;color:#9ca3af;">Please try again or contact support.</p>
                    </div>`;

                oViewModel.setProperty("/resultsPlaceholderVisible", false);
                oViewModel.setProperty("/resultTextVisible", true);
                oViewModel.setProperty("/resultContent", errorHtml);
                this.byId("resultsPlaceholder")?.setVisible(false);
                this.byId("resultText")?.setVisible(true).setContent(errorHtml);
                this.byId("exportBtn")?.setVisible(false);

            } finally {
                this.getView().setBusy(false);
                this._abortController = null;
                oViewModel.setProperty("/authenticationStatus", "");
            }
        },

        processResponse: async function (data) {
            this.jsonData = data;
            var oViewModel = this.getView().getModel("view");
            let html = "";

            await new Promise((resolve, reject) => {
                if (window.marked) return resolve();
                const script = document.createElement("script");
                script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

            window.marked.setOptions({ breaks: true });

            const formatValue = function (val) {
                if (val === null || val === undefined || val === "") {
                    return '<span style="color:#94a3b8;font-style:italic;">—</span>';
                }
                if (typeof val === "boolean") return val ? "✅ True" : "❌ False";
                if (typeof val === "number") return String(val);
                if (typeof val === "string") {
                    // Check if it's a JSON string that needs parsing
                    try {
                        const parsed = JSON.parse(val);
                        return formatValue(parsed);
                    } catch (e) {
                        return val;
                    }
                }
                if (Array.isArray(val)) {
                    if (val.length === 0) return '<span style="color:#94a3b8;font-style:italic;">Empty array</span>';
                    // Format array items nicely
                    return val.map(item => {
                        if (typeof item === "object" && item !== null) {
                            return `<div style="margin-bottom: 8px;">${formatObjectValue(item)}</div>`;
                        }
                        return `<div>${String(item)}</div>`;
                    }).join("");
                }
                if (typeof val === "object" && val !== null) {
                    return formatObjectValue(val);
                }
                return String(val);
            };

            const formatObjectValue = function (obj) {
                if (Object.keys(obj).length === 0) return '<span style="color:#94a3b8;font-style:italic;">Empty object</span>';
                return `<div style="display: flex; flex-direction: column; gap: 6px;">
            ${Object.entries(obj).map(([k, v]) => {
                    // Escape the key to prevent XSS
                    const safeKey = String(k).replace(/[&<>]/g, function (m) {
                        if (m === '&') return '&amp;';
                        if (m === '<') return '&lt;';
                        if (m === '>') return '&gt;';
                        return m;
                    });
                    return `
                    <div style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px;">
                        <strong style="color: #3d3abf;">${safeKey}:</strong>
                        <span>${formatValue(v)}</span>
                    </div>
                `;
                }).join("")}
        </div>`;
            };

            if (data && data.success) {
                const result = data.success;
                const summary = result.document_summary || "";
                const keyFields = result.key_fields || null;
                const parsedSummary = window.marked.parse(summary);

                html += `<div style="width:100%;max-width:100%;box-sizing:border-box;overflow-x:auto;">`;
                html += `<div class="summary-box">${parsedSummary}</div>`;

                if (keyFields) {
                    html += `<h3 class="keyFieldsTitle">🔑 Key Fields</h3>`;
                    html += `
            <table class="keyFieldsTable" style="width:100%;table-layout:fixed;">
                <thead>
                    <tr>
                        <th class="keyTh" style="width:35%;text-align:left;padding:12px;background:#f1f5f9;border:1px solid #e2e8f0;">Field</th>
                        <th class="valueTh" style="width:65%;text-align:left;padding:12px;background:#f1f5f9;border:1px solid #e2e8f0;">Value</th>
                    </tr>
                </thead>
                <tbody>`;

                    // Handle key_fields regardless of its structure
                    let entries = [];

                    if (Array.isArray(keyFields)) {
                        // If it's an array, flatten all objects
                        keyFields.forEach(item => {
                            if (typeof item === "object" && item !== null) {
                                entries.push(...Object.entries(item));
                            }
                        });
                    } else if (typeof keyFields === "object" && keyFields !== null) {
                        // If it's a single object
                        entries = Object.entries(keyFields);
                    }

                    // Sort entries alphabetically for better readability
                    entries.sort((a, b) => a[0].localeCompare(b[0]));

                    entries.forEach(function ([key, value]) {
                        // Escape the key to prevent XSS
                        const safeKey = String(key).replace(/[&<>]/g, function (m) {
                            if (m === '&') return '&amp;';
                            if (m === '<') return '&lt;';
                            if (m === '>') return '&gt;';
                            return m;
                        });

                        let parsedValue = "";

                        // Handle value formatting
                        if (typeof value === "string") {
                            // Try to parse if it's JSON string
                            try {
                                const parsed = JSON.parse(value);
                                parsedValue = formatValue(parsed);
                            } catch (e) {
                                // Not JSON, check if it contains markdown
                                if (value.includes('\n') || value.includes('*') || value.includes('#')) {
                                    parsedValue = window.marked.parseInline(value);
                                } else {
                                    parsedValue = value;
                                }
                            }
                        } else {
                            parsedValue = formatValue(value);
                        }

                        html += `
                <tr>
                    <td class="keyTd" style="padding:12px;border:1px solid #e2e8f0;background:#f8fafc;word-break:break-word;vertical-align:top;">
                        <strong>${safeKey}</strong>
                    </td>
                    <td class="valueTd" style="padding:12px;border:1px solid #e2e8f0;background:#ffffff;word-break:break-word;vertical-align:top;">
                        ${parsedValue}
                    </td>
                </tr>`;
                    });

                    html += `</tbody>
            </table>`;
                }

                html += `</div>`;

            } else {
                const parsedMessage = window.marked
                    ? window.marked.parse(data.message || "Document processed but no data extracted")
                    : (data.message || "Document processed but no data extracted");

                html = `<div style="color:#856404;background:#fff3cd;padding:20px;border-radius:8px;text-align:center;box-sizing:border-box;">
            <h3 style="margin:0 0 8px 0;">⚠️ Verification Response</h3>
            <div>${parsedMessage}</div>
        </div>`;
            }

            oViewModel.setProperty("/resultsPlaceholderVisible", false);
            oViewModel.setProperty("/resultTextVisible", true);
            oViewModel.setProperty("/exportBtnVisible", true);
            oViewModel.setProperty("/resultContent", html);

            this.byId("resultsPlaceholder")?.setVisible(false);
            this.byId("_IDGenScrollContainer")?.setVisible(true);
            this.byId("resultText")?.setVisible(true).setContent(html);
            this.byId("exportBtn")?.setVisible(true);

            MessageToast.show("Verification completed successfully");
        },
        onExportJson: function () {
            if (!this.jsonData) {
                MessageToast.show("No data to export");
                return;
            }
            try {
                var oData = {
                    extractionResult: this.jsonData,
                    exportDate: new Date().toISOString(),
                    fileName: this._selectedFile ? this._selectedFile.name : "unknown",
                    fileType: this._selectedFile ? this._selectedFile.type : "unknown"
                };
                var sJson = JSON.stringify(oData, null, 2);
                var blob = new Blob([sJson], { type: "application/json" });
                var url = URL.createObjectURL(blob);
                var a = document.createElement("a");
                a.href = url;
                a.download = `extraction_results_${new Date().getTime()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 100);
                MessageToast.show("Export successful");
            } catch (err) {
                console.error("Export error:", err);
                MessageToast.show("Export failed");
            }
        },

        onClearPress: function () {
            if (this._abortController) {
                this._abortController.abort();
                this._abortController = null;
            }

            this.getView().setBusy(false);
            var oViewModel = this.getView().getModel("view");

            oViewModel.setProperty("/previewPlaceholderVisible", true);
            oViewModel.setProperty("/imagePreviewVisible", false);
            oViewModel.setProperty("/pdfPreviewVisible", false);
            oViewModel.setProperty("/resultsPlaceholderVisible", true);
            oViewModel.setProperty("/resultTextVisible", false);
            oViewModel.setProperty("/exportBtnVisible", false);
            oViewModel.setProperty("/previewSrc", "");
            oViewModel.setProperty("/pdfContent", "");
            oViewModel.setProperty("/resultContent", "");
            oViewModel.setProperty("/authenticationStatus", "");

            var oFileUploader = this.byId("fileUploader");
            if (oFileUploader) {
                oFileUploader.clear();
                oFileUploader.setValue("");
            }

            this.byId("Preview")?.setVisible(false).setSrc("");
            this.byId("PdfPreviewHtml")?.setVisible(false).setContent("");
            this.byId("previewPlaceholder")?.setVisible(true);
            this.byId("resultText")?.setVisible(false).setContent("");
            this.byId("_IDGenScrollContainer")?.setVisible(false);
            this.byId("resultsPlaceholder")?.setVisible(true);
            this.byId("exportBtn")?.setVisible(false);

            if (this._pdfBlobUrl) {
                URL.revokeObjectURL(this._pdfBlobUrl);
                this._pdfBlobUrl = null;
            }

            this.jsonData = null;
            this._selectedFile = null;

            MessageToast.show("Cleared successfully");
        },

        onExit: function () {
            if (this._pdfBlobUrl) {
                URL.revokeObjectURL(this._pdfBlobUrl);
                this._pdfBlobUrl = null;
            }
            if (this._abortController) {
                this._abortController.abort();
                this._abortController = null;
            }
        }
    });
});