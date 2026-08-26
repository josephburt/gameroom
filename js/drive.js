/* Google Drive Picker → ROM bytes. */
(function (g) {
  "use strict";

  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const STORE = "grok-nes-drive";
  let tokenClient = null;
  let accessToken = null;
  let pickerReady = false;
  let gisReady = false;

  function defaults() {
    return g.GROK_DRIVE_DEFAULTS || {};
  }

  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "null") || {};
    } catch (e) {
      return {};
    }
  }

  function saveCfg(cfg) {
    localStorage.setItem(STORE, JSON.stringify({
      clientId: cfg.clientId.trim(),
      apiKey: cfg.apiKey.trim(),
      appId: String(cfg.appId).trim()
    }));
  }

  function getCfg() {
    const d = defaults();
    const s = loadSaved();
    return {
      clientId: s.clientId || d.clientId || "",
      apiKey: s.apiKey || d.apiKey || "",
      appId: s.appId || d.appId || ""
    };
  }

  function isConfigured() {
    const c = getCfg();
    return !!(c.clientId && c.apiKey && c.appId);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing && existing.getAttribute("data-grok-loaded") === "1") {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        s.setAttribute("data-grok-loaded", "1");
        resolve();
      };
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  async function ensureApis() {
    await loadScript("https://accounts.google.com/gsi/client");
    await loadScript("https://apis.google.com/js/api.js");
    gisReady = true;
    await new Promise(function (resolve, reject) {
      if (pickerReady) { resolve(); return; }
      gapi.load("picker", function () { pickerReady = true; resolve(); });
    });
  }

  function requestToken(cfg, prompt) {
    return new Promise(function (resolve, reject) {
      if (accessToken && prompt !== "consent") {
        resolve(accessToken);
        return;
      }
      tokenClient = g.google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: SCOPE,
        callback: function (resp) {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          accessToken = resp.access_token;
          resolve(accessToken);
        }
      });
      tokenClient.requestAccessToken({ prompt: prompt || (accessToken ? "" : "consent") });
    });
  }

  function openPicker(cfg, token) {
    return new Promise(function (resolve, reject) {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMode(google.picker.DocsViewMode.LIST);
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .setOAuthToken(token)
        .setDeveloperKey(cfg.apiKey)
        .setAppId(String(cfg.appId))
        .setTitle("Load a NES, Game Boy, or Game Boy Color ROM")
        .setCallback(function (data) {
          if (!data) return;
          if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
            return;
          }
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs && data.docs[0];
            if (!doc) {
              reject(new Error("No file selected"));
              return;
            }
            resolve(doc);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  async function downloadDoc(doc, token) {
    const url = "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(doc.id) + "?alt=media&supportsAllDrives=true";
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) {
      throw new Error("Drive download failed (" + res.status + "). Re-pick the file, and make sure the Cloud project number is set as App ID.");
    }
    const buf = await res.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      name: doc.name || "drive.rom"
    };
  }

  async function pickRom() {
    if (!isConfigured()) {
      const err = new Error("Drive is not configured");
      err.code = "needs-config";
      throw err;
    }
    const cfg = getCfg();
    await ensureApis();
    const token = await requestToken(cfg);
    const doc = await openPicker(cfg, token);
    if (!doc) return null;
    return downloadDoc(doc, token);
  }

  g.GrokDrive = {
    getCfg: getCfg,
    saveCfg: saveCfg,
    isConfigured: isConfigured,
    pickRom: pickRom
  };
})(typeof window !== "undefined" ? window : globalThis);
