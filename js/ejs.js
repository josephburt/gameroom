/* Game Boy / GBC / SNES / GBA / Genesis via EmulatorJS. */
(function (g) {
  "use strict";

  const CDN = "https://cdn.emulatorjs.org/stable/data/";
  const ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ];
  let scriptLoaded = false;
  let scriptLoading = null;

  function fileName(name, core) {
    const ext = (g.GrokRom && GrokRom.extOf(name)) || "";
    if (core === "snes") {
      if (ext === "sfc" || ext === "smc" || ext === "fig" || ext === "swc") return name;
      return (name || "game") + ".sfc";
    }
    if (core === "gba") {
      if (ext === "gba" || ext === "agb" || ext === "mb") return name;
      return (name || "game") + ".gba";
    }
    if (core === "segaMD") {
      if (ext === "md" || ext === "gen" || ext === "smd" || ext === "bin") return name;
      return (name || "game") + ".md";
    }
    if (ext === "gb" || ext === "gbc" || ext === "dmg" || ext === "sgb") return name;
    return (name || "game") + ".gb";
  }

  function controlSchemeFor(core) {
    if (core === "snes") return "snes";
    if (core === "gba") return "gba";
    if (core === "segaMD") return "segaMD";
    return "gb";
  }

  function defaultControls() {
    return {
      0: {
        0: { value: "z", value2: "BUTTON_2" },
        1: { value: "c", value2: "BUTTON_4" },
        2: { value: "shift", value2: "SELECT" },
        3: { value: "enter", value2: "START" },
        4: { value: "up arrow", value2: "DPAD_UP" },
        5: { value: "down arrow", value2: "DPAD_DOWN" },
        6: { value: "left arrow", value2: "DPAD_LEFT" },
        7: { value: "right arrow", value2: "DPAD_RIGHT" },
        8: { value: "x", value2: "BUTTON_1" },
        9: { value: "v", value2: "BUTTON_3" },
        10: { value: "q", value2: "LEFT_TOP_SHOULDER" },
        11: { value: "e", value2: "RIGHT_TOP_SHOULDER" }
      },
      1: {},
      2: {},
      3: {}
    };
  }

  function applyGlobals(file, name, opts) {
    const core = opts.core || "gb";
    g.EJS_player = "#ejs-player";
    g.EJS_core = core;
    g.EJS_gameUrl = file;
    g.EJS_gameName = String(name || "game").replace(/\.[^.]+$/, "");
    g.EJS_pathtodata = CDN;
    g.EJS_startOnLoaded = true;
    g.EJS_color = opts.color || "#ff3b4e";
    g.EJS_backgroundColor = "#000000";
    g.EJS_controlScheme = controlSchemeFor(core);
    g.EJS_gameID = opts.gameId || 1;
    g.EJS_volume = opts.muted ? 0 : (opts.volume == null ? 0.7 : opts.volume);
    g.EJS_askBeforeExit = false;
    g.EJS_browserMode = "desktop";
    g.EJS_defaultControls = defaultControls();
    g.EJS_netplayServer = "https://netplay.emulatorjs.org/";
    g.EJS_netplayICEServers = ICE;
    g.EJS_defaultOptions = {
      "save-state-location": "browser",
      rewind: true
    };
    g.EJS_Buttons = {
      playPause: { visible: false },
      restart: { visible: false },
      mute: { visible: false },
      settings: { visible: true },
      fullscreen: { visible: false },
      saveState: { visible: false },
      loadState: { visible: false },
      exitEmulation: { visible: false },
      gamepad: { visible: false },
      volume: { visible: false },
      quickSave: { visible: false },
      quickLoad: { visible: false }
    };
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
      startOnLoad: true,
      gameId: g.EJS_gameID,
      backgroundColor: "#000000",
      controlScheme: g.EJS_controlScheme,
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
        reject(new Error("Failed to load emulator core from CDN"));
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
    const el = document.getElementById("ejs-player");
    if (el) el.innerHTML = "";
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  }

  async function start(bytes, name, opts) {
    opts = opts || {};
    const el = document.getElementById("ejs-player");
    const crt = document.getElementById("crt-wrap");
    if (!el || !crt) throw new Error("Missing emulator player");
    stop();
    crt.classList.add("is-ejs");
    el.removeAttribute("hidden");
    await nextFrame();
    const core = opts.core || "gb";
    const file = new File([bytes], fileName(name, core), { type: "application/octet-stream" });
    applyGlobals(file, name, opts);
    if (!scriptLoaded) {
      await loadLoader();
    }
    if (typeof g.EmulatorJS !== "function") {
      throw new Error("Emulator failed to initialize");
    }
    g.EJS_emulator = new g.EmulatorJS("#ejs-player", configFromGlobals());
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

  function setVolume(level, muted) {
    const inst = emu();
    const v = muted ? 0 : Math.max(0, Math.min(1, level));
    if (inst) inst.volume = level;
    if (!inst || !inst.setVolume) return;
    try { inst.setVolume(v); } catch (e) {}
  }

  function setTurbo(on) {
    const inst = emu();
    if (!inst) return false;
    try {
      if (inst.gameManager && typeof inst.gameManager.toggleFastForward === "function") {
        inst.gameManager.toggleFastForward(on);
        return true;
      }
    } catch (e) {}
    try {
      if (typeof inst.setSpeed === "function") {
        inst.setSpeed(on ? 3 : 1);
        return true;
      }
    } catch (e) {}
    try {
      if (typeof inst.changeSettingOption === "function") {
        inst.changeSettingOption("fast-forward", on ? "enabled" : "disabled");
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function getState() {
    const inst = emu();
    if (!inst || !inst.gameManager || !inst.gameManager.getState) {
      throw new Error("Save states are not ready yet");
    }
    const st = await inst.gameManager.getState();
    if (!st) throw new Error("Could not capture save state");
    if (st instanceof ArrayBuffer) return new Uint8Array(st);
    if (st.buffer) return new Uint8Array(st.buffer, st.byteOffset, st.byteLength);
    if (st.state) {
      const s = st.state;
      if (s instanceof ArrayBuffer) return new Uint8Array(s);
      if (s.buffer) return new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
    }
    return new Uint8Array(st);
  }

  async function loadState(bytes) {
    const inst = emu();
    if (!inst || !inst.gameManager || !inst.gameManager.loadState) {
      throw new Error("Load state is not ready yet");
    }
    await inst.gameManager.loadState(bytes);
  }

  function setRewind(on) {
    const inst = emu();
    if (!inst) return false;
    try {
      if (inst.gameManager && typeof inst.gameManager.rewind === "function") {
        inst.gameManager.rewind(on);
        return true;
      }
    } catch (e) {}
    return false;
  }

  g.GrokEjs = {
    start: start,
    stop: stop,
    setPaused: setPaused,
    reset: reset,
    setMuted: setMuted,
    setVolume: setVolume,
    setTurbo: setTurbo,
    getState: getState,
    loadState: loadState,
    setRewind: setRewind,
    emu: emu
  };
})(typeof window !== "undefined" ? window : globalThis);
