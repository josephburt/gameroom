/* Game Boy / Game Boy Color via EmulatorJS (gambatte). */
(function (g) {
  "use strict";

  const CDN = "https://cdn.emulatorjs.org/stable/data/";
  let scriptLoaded = false;
  let scriptLoading = null;

  function buttons() {
    return {
      playPause: false,
      restart: false,
      mute: false,
      settings: true,
      fullscreen: false,
      saveState: true,
      loadState: true,
      screenRecord: false,
      gamepad: true,
      cheat: false,
      volume: false,
      saveSavFiles: true,
      loadSavFiles: true,
      quickSave: true,
      quickLoad: true,
      screenshot: false,
      cacheManager: false,
      exitEmulation: false
    };
  }

  function applyGlobals(file, name, opts) {
    g.EJS_player = "#gb-player";
    g.EJS_core = "gb";
    g.EJS_gameUrl = file;
    g.EJS_gameName = String(name || "game").replace(/\.[^.]+$/, "");
    g.EJS_pathtodata = CDN;
    g.EJS_startOnLoaded = true;
    g.EJS_color = "#ff3b4e";
    g.EJS_backgroundColor = "#000000";
    g.EJS_controlScheme = "gb";
    g.EJS_gameID = opts.gameId || 1;
    g.EJS_volume = opts.muted ? 0 : 1;
    g.EJS_askBeforeExit = false;
    g.EJS_Buttons = buttons();
    g.EJS_onGameStart = opts.onStart || function () {};
  }

  function configFromGlobals() {
    return {
      gameUrl: g.EJS_gameUrl,
      dataPath: CDN,
      system: g.EJS_core,
      gameName: g.EJS_gameName,
      color: g.EJS_color,
      buttonOpts: g.EJS_Buttons,
      volume: g.EJS_volume,
      startOnLoad: g.EJS_startOnLoaded,
      gameId: g.EJS_gameID,
      backgroundColor: g.EJS_backgroundColor,
      controlScheme: g.EJS_controlScheme,
      askBeforeExit: g.EJS_askBeforeExit
    };
  }

  function loadLoader() {
    if (scriptLoaded) return Promise.resolve();
    if (scriptLoading) return scriptLoading;
    scriptLoading = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = CDN + "loader.js";
      s.onload = function () { scriptLoaded = true; resolve(); };
      s.onerror = function () { scriptLoading = null; reject(new Error("Failed to load Game Boy core")); };
      document.body.appendChild(s);
    });
    return scriptLoading;
  }

  function emu() {
    return g.EJS_emulator || null;
  }

  function stop() {
    const inst = emu();
    if (inst) {
      try { if (inst.pause) inst.pause(); } catch (e) {}
      try { if (inst.setVolume) inst.setVolume(0); } catch (e) {}
      g.EJS_emulator = null;
    }
    const el = document.getElementById("gb-player");
    if (el) {
      el.innerHTML = "";
      el.hidden = true;
    }
  }

  async function start(bytes, name, opts) {
    opts = opts || {};
    const el = document.getElementById("gb-player");
    if (!el) throw new Error("Missing Game Boy player");
    stop();
    el.hidden = false;
    const file = new File([bytes], name || "game.gb", { type: "application/octet-stream" });
    applyGlobals(file, name, opts);
    if (!scriptLoaded) {
      await loadLoader();
      return;
    }
    if (typeof g.EmulatorJS !== "function") {
      throw new Error("Game Boy emulator failed to initialize");
    }
    g.EJS_emulator = new g.EmulatorJS("#gb-player", configFromGlobals());
    if (opts.onStart) {
      g.EJS_emulator.on("start", opts.onStart);
    }
  }

  function setPaused(paused) {
    const inst = emu();
    if (!inst) return;
    try {
      if (paused && inst.pause) inst.pause();
      if (!paused && inst.play) inst.play();
    } catch (e) {}
  }

  function reset() {
    const inst = emu();
    if (inst && inst.gameManager && inst.gameManager.restart) {
      try { inst.gameManager.restart(); } catch (e) {}
    }
  }

  function setMuted(muted) {
    const inst = emu();
    if (!inst || !inst.setVolume) return;
    try { inst.setVolume(muted ? 0 : (inst.volume || 1)); } catch (e) {}
  }

  g.GrokGB = {
    start: start,
    stop: stop,
    setPaused: setPaused,
    reset: reset,
    setMuted: setMuted,
    isActive: function () { return !!(emu() && !document.getElementById("gb-player").hidden); }
  };
})(typeof window !== "undefined" ? window : globalThis);
