/* Game Boy / Game Boy Color via EmulatorJS (gambatte). */
(function (g) {
  "use strict";

  const CDN = "https://cdn.emulatorjs.org/stable/data/";
  let scriptLoaded = false;
  let scriptLoading = null;

  function gbFileName(name) {
    const ext = (g.GrokRom && GrokRom.extOf(name)) || "";
    if (ext === "gb" || ext === "gbc" || ext === "dmg" || ext === "sgb") return name;
    return (name || "game") + ".gb";
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
    g.EJS_volume = opts.muted ? 0 : 0.7;
    g.EJS_askBeforeExit = false;
    g.EJS_Buttons = {
      playPause: { visible: true },
      restart: { visible: true },
      mute: { visible: true },
      settings: { visible: true },
      fullscreen: { visible: false },
      saveState: { visible: true },
      loadState: { visible: true },
      exitEmulation: { visible: false }
    };
    g.EJS_onGameStart = opts.onStart || function () {};
  }

  function configFromGlobals() {
    return {
      gameUrl: g.EJS_gameUrl,
      dataPath: CDN,
      system: "gb",
      gameName: g.EJS_gameName,
      color: g.EJS_color,
      buttonOpts: g.EJS_Buttons,
      volume: g.EJS_volume,
      startOnLoad: true,
      gameId: g.EJS_gameID,
      backgroundColor: "#000000",
      controlScheme: "gb",
      askBeforeExit: false,
      cacheConfig: { enabled: true, cacheMaxSizeMB: 512, cacheMaxAgeMins: 7200 }
    };
  }

  function loadLoader() {
    if (scriptLoaded) return Promise.resolve();
    if (scriptLoading) return scriptLoading;
    scriptLoading = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = CDN + "loader.js";
      s.onload = function () { scriptLoaded = true; resolve(); };
      s.onerror = function () {
        scriptLoading = null;
        reject(new Error("Failed to load Game Boy core from CDN"));
      };
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
    if (el) el.innerHTML = "";
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  }

  async function start(bytes, name, opts) {
    opts = opts || {};
    const el = document.getElementById("gb-player");
    const crt = document.getElementById("crt-wrap");
    if (!el || !crt) throw new Error("Missing Game Boy player");
    stop();
    crt.classList.add("is-gb");
    el.removeAttribute("hidden");
    await nextFrame();
    const file = new File([bytes], gbFileName(name), { type: "application/octet-stream" });
    applyGlobals(file, name, opts);
    if (!scriptLoaded) {
      await loadLoader();
      return;
    }
    if (typeof g.EmulatorJS !== "function") {
      throw new Error("Game Boy emulator failed to initialize");
    }
    g.EJS_emulator = new g.EmulatorJS("#gb-player", configFromGlobals());
    if (opts.onStart) g.EJS_emulator.on("start", opts.onStart);
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
    try { inst.setVolume(muted ? 0 : (inst.volume || 0.7)); } catch (e) {}
  }

  g.GrokGB = {
    start: start,
    stop: stop,
    setPaused: setPaused,
    reset: reset,
    setMuted: setMuted
  };
})(typeof window !== "undefined" ? window : globalThis);
