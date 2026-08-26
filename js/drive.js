/* Google Drive Picker → ROM bytes. */
(function (g) {
  "use strict";

  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const STORE = "grok-nes-drive";
  let accessToken = null;
  let pickerReady = false;
  let apisPromise = null;

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
      clientId: (cfg.clientId || "").trim(),
      apiKey: (cfg.apiKey || "").trim(),
      appId: String(cfg.appId || "").trim()
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
    return !!getCfg().clientId;
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

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      const t = setTimeout(function () {
        reject(new Error(label + " timed out. Check pop-up blockers and that this origin is in the OAuth client."));
      }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function ensureApis() {
    if (pickerReady) return Promise.resolve();
    if (apisPromise) return apisPromise;
    apisPromise = (async function () {
      await loadScript("https://accounts.google.com/gsi/client");
      await loadScript("https://apis.google.com/js/api.js");
      if (typeof gapi === "undefined" || !gapi.load) throw new Error("Google API script did not initialize");
      await new Promise(function (resolve, reject) {
        try {
          gapi.load("picker", {
            callback: function () { pickerReady = true; resolve(); },
            onerror: function () { reject(new Error("Google Picker failed to load")); },
            timeout: 15000,
            ontimeout: function () { reject(new Error("Google Picker load timed out")); }
          });
        } catch (e) { reject(e); }
      });
    })().catch(function (err) {
      apisPromise = null;
      throw err;
    });
    return apisPromise;
  }

  function warmup() {
    ensureApis().catch(function () {});
  }

  function requestToken(cfg) {
    return withTimeout(new Promise(function (resolve, reject) {
      if (accessToken) {
        resolve(accessToken);
        return;
      }
      if (!g.google || !google.accounts || !google.accounts.oauth2) {
        reject(new Error("Google sign-in script is not ready"));
        return;
      }
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: SCOPE,
        callback: function (resp) {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          accessToken = resp.access_token;
          resolve(accessToken);
        },
        error_callback: function (err) {
          reject(new Error((err && err.message) || "Google sign-in was cancelled"));
        }
      });
      tokenClient.requestAccessToken({ prompt: "consent" });
    }), 60000, "Google sign-in");
  }

  function openPicker(cfg, token) {
    return withTimeout(new Promise(function (resolve, reject) {
      const view = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMode(google.picker.DocsViewMode.LIST);
      if (view.setEnableDrives) view.setEnableDrives(true);

      const builder = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setOrigin(window.location.origin)
        .setTitle("Select a .nes, .gb, .gbc, or .zip file")
        .setCallback(function (data) {
          if (!data) return;
          if (data.action === google.picker.Action.LOADED) return;
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
        });

      if (cfg.apiKey) builder.setDeveloperKey(cfg.apiKey);
      if (cfg.appId) builder.setAppId(String(cfg.appId));
      try {
        builder.enableFeature(google.picker.Feature.SUPPORT_DRIVES);
      } catch (e) {}
      builder.build().setVisible(true);
    }), 180000, "Drive picker");
  }

  async function downloadDoc(doc, token) {
    const url = "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(doc.id) + "?alt=media&supportsAllDrives=true";
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) {
      let extra = "";
      try { extra = (await res.json()).error && extra; } catch (e) {}
      throw new Error("Drive download failed (" + res.status + "). Pick the file again, and set App ID to your Cloud project number.");
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
    pickRom: pickRom,
    warmup: warmup
  };
})(typeof window !== "undefined" ? window : globalThis);
