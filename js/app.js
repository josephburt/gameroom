(function () {
  "use strict";

  const SYSTEMS = (window.GrokSystems && GrokSystems.byId) || {};
  const system = GrokSystems && GrokSystems.fromQuery();
  if (!system || !SYSTEMS[system]) {
    location.replace("index.html");
    return;
  }

  const canvas = document.getElementById("screen");
  const ctx = canvas.getContext("2d", { alpha: false });
  const img = ctx.createImageData(256, 240);
  const img32 = new Uint32Array(img.data.buffer);
  const crt = document.getElementById("crt-wrap");

  const nes = new NES();
  let paused = false;
  let muted = false;
  let running = false;
  let raf = 0;
  let frames = 0;
  let lastFps = performance.now();
  let frameAcc = 0;
  let lastTime = 0;
  let audioCtx = null;
  let scriptNode = null;
  let currentRom = { bytes: null, name: "", id: 0, kind: system };
  let rewindHeld = false;
  let volume = 0.7;
  let turbo = false;
  let gainNode = null;
  let shotTimer = 0;

  const KEYMAP = {
    ArrowRight: 7, ArrowLeft: 6, ArrowDown: 5, ArrowUp: 4,
    KeyD: 7, KeyA: 6, KeyS: 5, KeyW: 4,
    Enter: 3, ShiftLeft: 2, ShiftRight: 2, Space: 2,
    KeyX: 0, KeyJ: 0,
    KeyZ: 1, KeyK: 1
  };

  const NES_FPS = 60.0988;
  const NES_FRAME_MS = 1000 / NES_FPS;
  const NES_MAX_CATCHUP = 4;

  function $(id) { return document.getElementById(id); }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function blit() {
    img32.set(nes.ppu.pixels);
    ctx.putImageData(img, 0, 0);
  }

  function mapperLabel(cart) {
    const n = NES_MAPPER_NAMES[cart.mapperId] || "UNK";
    return cart.mapperId + " " + n;
  }

  function setHint(text) { $("hint").textContent = text; }

  function updateHud() {
    const el = $("play-hud");
    if (!el) return;
    const bits = [];
    if (turbo) bits.push("<span class='hud-pill turbo'>TURBO</span>");
    if (rewindHeld) bits.push("<span class='hud-pill rewind'>REWIND</span>");
    if (paused) bits.push("<span class='hud-pill'>PAUSE</span>");
    el.innerHTML = bits.join("");
  }

  function showBoot(title, sys, msg) {
    $("boot-overlay").hidden = false;
    $("boot-title").textContent = title || "Loading";
    $("boot-sys").textContent = sys || "";
    $("boot-msg").textContent = msg || "Fetching the emulator core…";
  }
  function hideBoot() { $("boot-overlay").hidden = true; }

  function captureShot() {
    try {
      const src = system === "nes"
        ? canvas
        : document.querySelector("#ejs-player canvas, #ejs-player .ejs_canvas");
      if (!src) return "";
      const sw = src.width || src.videoWidth || 256;
      const sh = src.height || src.videoHeight || 240;
      const tmp = document.createElement("canvas");
      tmp.width = sw;
      tmp.height = sh;
      tmp.getContext("2d").drawImage(src, 0, 0, sw, sh);
      return tmp.toDataURL("image/jpeg", 0.72);
    } catch (e) {
      return "";
    }
  }

  function rememberCurrent() {
    if (!currentRom.id || !currentRom.bytes) return;
    const title = GrokRom.prettyName(currentRom.kind, currentRom.bytes, currentRom.name);
    GrokLibrary.remember({
      id: currentRom.id,
      name: currentRom.name,
      title: title,
      kind: currentRom.kind,
      bytes: currentRom.bytes,
      shot: captureShot()
    }).then(renderRecents).catch(function () {});
  }

  function scheduleShot() {
    clearTimeout(shotTimer);
    shotTimer = setTimeout(function () {
      const shot = captureShot();
      if (shot && currentRom.id) {
        GrokLibrary.touchShot(currentRom.id, shot).then(renderRecents).catch(function () {});
      }
    }, 2500);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function isEjs(sys) { return GrokSystems.isEjs(sys); }

  function kindGuess(ext) {
    if (ext === "nes" || ext === "unf" || ext === "unif" || ext === "fds") return "NES";
    if (ext === "gbc") return "GBC";
    if (ext === "gb" || ext === "sgb" || ext === "dmg") return "GB";
    if (ext === "gba" || ext === "agb" || ext === "mb") return "GBA";
    if (ext === "sfc" || ext === "smc" || ext === "fig" || ext === "swc") return "SNES";
    if (ext === "z64" || ext === "n64" || ext === "v64") return "N64";
    if (ext === "zip") return "ZIP";
    return ext.toUpperCase();
  }

  function entryMatchesSystem(entry) {
    const spec = SYSTEMS[system];
    if (!spec || !entry) return false;
    const ext = String(entry.ext || "").toLowerCase();
    return spec.exts.indexOf(ext) !== -1;
  }

  async function renderRecents() {
    const wrap = $("recents-wrap");
    const root = $("recents");
    if (!wrap || !root) return;
    const games = (await GrokLibrary.list()).filter(function (g) { return g.kind === system; });
    if (!games.length) {
      wrap.hidden = true;
      root.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    root.innerHTML = "";
    games.forEach(function (g) {
      const card = document.createElement("div");
      card.className = "recent";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "recent-open";
      open.setAttribute("aria-label", "Continue " + (g.title || g.name));
      const thumb = g.shot
        ? "<img alt=\"\" src=\"" + g.shot + "\" />"
        : "<div class=\"recent-ph\" aria-hidden=\"true\"></div>";
      const extra = g.tooLarge ? " · load from library" : "";
      open.innerHTML = thumb +
        "<div class=\"recent-meta\"><strong>" + escapeHtml(g.title || g.name) + "</strong><span>" +
        SYSTEMS[g.kind].label + extra + "</span></div>";
      open.onclick = function () {
        if (g.tooLarge || !g.bytes) {
          setHint("This dump is too large to keep in Continue. Load it from the library or disk.");
          return;
        }
        const bytes = g.bytes instanceof Uint8Array ? g.bytes : new Uint8Array(g.bytes);
        Promise.resolve(playRom({ bytes: bytes, name: g.name, kind: g.kind })).catch(function (err) {
          hideBoot();
          setHint(String(err.message || err));
        });
      };
      const x = document.createElement("button");
      x.type = "button";
      x.className = "recent-x";
      x.textContent = "×";
      x.setAttribute("aria-label", "Remove " + (g.title || g.name) + " from Continue");
      x.onclick = function (e) {
        e.stopPropagation();
        GrokLibrary.remove(g.id).then(renderRecents);
      };
      card.appendChild(open);
      card.appendChild(x);
      root.appendChild(card);
    });
  }

  function renderKeys() {
    const spec = SYSTEMS[system];
    const table = $("keys-table");
    table.innerHTML = spec.keys.map(function (row) {
      return "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>";
    }).join("");
    $("keys-note").textContent = spec.note;
  }

  function applySystemChrome() {
    const spec = SYSTEMS[system];
    document.body.setAttribute("data-system", system);
    document.title = spec.label + " library — Burt Labs GameRoom";
    crt.setAttribute("data-system", system);
    crt.classList.toggle("is-ejs", isEjs(system));
    $("meter-label").textContent = spec.meter;
    $("file").accept = spec.accept;
    $("rom-name").textContent = spec.label;
    $("play-tag").textContent = spec.label + " library";
    $("deck-title").textContent = spec.label;
    $("deck-eyebrow").textContent = "ROM library";
    $("deck-sub").textContent = spec.prompt;
    const demo = $("btn-demo");
    if (demo) demo.hidden = system !== "nes";
    const biosBtn = $("btn-bios");
    if (biosBtn && GrokFolders && GrokFolders.supported()) {
      biosBtn.hidden = !(system === "gba" || system === "gb" || system === "gbc");
    }
    renderKeys();
    if (window.GrokTouch) GrokTouch.sync();
  }

  function setPlayingUi(name, info) {
    $("rom-name").textContent = name || "ROM";
    $("mapper-info").textContent = info;
    $("hint").textContent = "Playing “" + (name || "ROM") + "”";
    paused = false;
    $("btn-pause").textContent = "Pause";
    $("run-dot").classList.add("on");
    $("deck-eyebrow").textContent = "Now playing";
    $("deck-sub").textContent = "Playing “" + (name || specLabel()) + "”.";
    updateHud();
  }

  function specLabel() {
    return SYSTEMS[system].label;
  }

  function stopNes() {
    running = false;
    try { nes.saveRam(); } catch (e) {}
  }

  function ensureAudio() {
    if (muted || system !== "nes") return;
    if (audioCtx && audioCtx.state === "running") return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      if (audioCtx.state === "suspended") audioCtx.resume();
      if (!scriptNode) {
        const buf = 2048;
        scriptNode = audioCtx.createScriptProcessor(buf, 0, 1);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = muted ? 0 : volume;
        scriptNode.onaudioprocess = function (e) {
          const out = e.outputBuffer.getChannelData(0);
          if (paused || muted || !running || system !== "nes" || rewindHeld) {
            out.fill(0);
            return;
          }
          for (let i = 0; i < out.length; i++) out[i] = nes.apu.pullSample();
        };
        scriptNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);
      }
      if (gainNode) gainNode.gain.value = muted ? 0 : volume;
    } catch (e) {}
  }

  function loadNes(bytes, name) {
    GrokEjs.stop();
    GrokNetplay.close();
    const cart = nes.loadRom(bytes, name);
    currentRom = { bytes: bytes, name: name, id: GrokRom.romId(bytes), kind: "nes" };
    GrokRewind.reset();
    setPlayingUi(name, mapperLabel(cart));
    running = true;
    frames = 0;
    lastFps = performance.now();
    frameAcc = 0;
    lastTime = 0;
    ensureAudio();
    rememberCurrent();
    scheduleShot();
    hideBoot();
  }

  async function loadEjs(bytes, name, kind) {
    stopNes();
    GrokNetplay.close();
    currentRom = { bytes: bytes, name: name, id: GrokRom.romId(bytes), kind: kind };
    GrokRewind.reset();
    const spec = SYSTEMS[kind];
    const title = GrokRom.prettyName(kind, bytes, name);
    setPlayingUi(title, GrokRom.systemLabel(kind, bytes));
    $("fps").textContent = spec.label;
    running = true;
    showBoot(title, spec.label, kind === "n64"
      ? "Loading the Nintendo 64 core. First time is a large download — desktop Chrome works best."
      : "Loading the " + spec.label + " core. First time can take a bit.");
    let biosUrl = "";
    try {
      if (GrokFolders && (kind === "gba" || kind === "gb" || kind === "gbc")) {
        const info = await GrokFolders.biosFor(kind);
        if (info) biosUrl = info.url || "";
      }
    } catch (e) {
      biosUrl = "";
    }
    await GrokEjs.start(bytes, name, {
      muted: muted,
      volume: volume,
      core: spec.core,
      biosUrl: biosUrl,
      color: spec.color,
      gameId: currentRom.id,
      onStart: function () {
        hideBoot();
        $("run-dot").classList.add("on");
        GrokEjs.setVolume(volume, muted);
        rememberCurrent();
        scheduleShot();
      }
    });
  }

  function playRom(rom) {
    if (rom.kind !== system) {
      throw new Error("This page is for " + specLabel() + ". That file looks like " +
        (SYSTEMS[rom.kind] ? SYSTEMS[rom.kind].label : rom.kind) + ".");
    }
    if (rom.kind === "nes") loadNes(rom.bytes, rom.name);
    else if (isEjs(rom.kind)) return loadEjs(rom.bytes, rom.name, rom.kind);
    else throw new Error("Unsupported ROM");
  }

  function pickZipRom(roms) {
    return new Promise(function (resolve) {
      const dlg = $("zip-pick");
      const list = $("zip-list");
      list.innerHTML = "";
      let chosen = null;
      let picked = false;
      roms.forEach(function (rom) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn";
        btn.textContent = rom.name + "  ·  " + GrokRom.systemLabel(rom.kind, rom.bytes);
        btn.onclick = function () {
          picked = true;
          chosen = rom;
          dlg.close();
        };
        li.appendChild(btn);
        list.appendChild(li);
      });
      function onClose() {
        dlg.removeEventListener("close", onClose);
        resolve(picked ? chosen : null);
      }
      dlg.addEventListener("close", onClose);
      $("zip-cancel").onclick = function () { dlg.close(); };
      dlg.showModal();
    });
  }

  async function loadBytes(bytes, name) {
    try {
      setHint("Reading “" + (name || "ROM") + "”…");
      const roms = (await GrokRom.listRoms(bytes, name, { prefer: system }))
        .filter(function (r) { return r.kind === system; });
      if (!roms.length) {
        throw new Error("No " + specLabel() + " ROM found in that file. This page only loads " + specLabel() + " games.");
      }
      let rom = roms[0];
      if (roms.length > 1) {
        setHint(roms.length + " matching ROMs in this zip — pick one");
        rom = await pickZipRom(roms);
        if (!rom) {
          setHint("Cancelled zip picker.");
          return;
        }
      }
      await playRom(rom);
    } catch (err) {
      console.error(err);
      hideBoot();
      setHint(String(err.message || err));
    }
  }

  function stepNesFrame() {
    const local = nes.ctrl1.buttons;
    const net = GrokNetplay.consume(local);
    if (net.active) {
      if (net.stall) return 0;
      nes.ctrl1.buttons = net.p1;
      nes.ctrl2.buttons = net.p2;
    }
    nes.stepFrame();
    let advanced = 1;
    if (turbo && !net.active) {
      nes.stepFrame();
      nes.stepFrame();
      advanced = 3;
    }
    if (net.active) nes.ctrl1.buttons = local;
    GrokRewind.onNesFrame(nes);
    return advanced;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (system !== "nes" || !running) { lastTime = now; frameAcc = 0; return; }
    if (rewindHeld) {
      GrokRewind.holdNes(nes, true);
      blit();
      lastTime = now;
      frameAcc = 0;
      return;
    }
    if (paused) { lastTime = now; frameAcc = 0; return; }

    if (!lastTime) lastTime = now;
    let dt = now - lastTime;
    lastTime = now;
    if (dt > 250) dt = NES_FRAME_MS;
    frameAcc += dt;

    let stepped = 0;
    let waiting = false;
    while (frameAcc >= NES_FRAME_MS && stepped < NES_MAX_CATCHUP) {
      const adv = stepNesFrame();
      if (adv === 0) { waiting = true; break; }
      frameAcc -= NES_FRAME_MS;
      stepped++;
      frames += adv;
    }
    if (frameAcc > NES_FRAME_MS * NES_MAX_CATCHUP) frameAcc = 0;

    if (waiting) { $("fps").textContent = "WAIT"; return; }
    if (stepped > 0) blit();
    if (now - lastFps >= 1000) {
      $("fps").textContent = frames + " FPS";
      frames = 0;
      lastFps = now;
    }
  }

  window.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.code === "Escape") {
      if (!$("help-overlay").hidden) { $("help-overlay").hidden = true; e.preventDefault(); return; }
    }
    if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) { e.preventDefault(); toggleHelp(); return; }
    const playing = !!currentRom.id;
    if (playing && e.code === "KeyP") { togglePause(); e.preventDefault(); return; }
    if (e.code === "KeyR" && (e.metaKey || e.ctrlKey)) return;
    if (playing && e.code === "KeyR") { reset(); e.preventDefault(); return; }
    if (playing && (e.code === "Backspace" || e.code === "F1")) {
      e.preventDefault();
      setRewind(true);
      return;
    }
    if (playing && e.code === "F5") { e.preventDefault(); saveSlot(0); return; }
    if (playing && e.code === "F7") { e.preventDefault(); loadSlot(0); return; }
    if (playing && e.code === "F8") { e.preventDefault(); screenshot(); return; }
    if (playing && e.code === "Tab") { e.preventDefault(); setTurbo(true); return; }
    if (system !== "nes" || !running) return;
    const b = KEYMAP[e.code];
    if (b !== undefined) {
      nes.ctrl1.setButton(b, true);
      e.preventDefault();
      ensureAudio();
    }
  });
  window.addEventListener("keyup", function (e) {
    if (e.code === "Backspace" || e.code === "F1") {
      setRewind(false);
      return;
    }
    if (e.code === "Tab") { setTurbo(false); return; }
    if (system !== "nes") return;
    const b = KEYMAP[e.code];
    if (b !== undefined) nes.ctrl1.setButton(b, false);
  });

  function pollGamepad() {
    if (system !== "nes") return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads[0];
    if (!p) return;
    const b = p.buttons;
    const ax = p.axes;
    nes.ctrl1.setButton(0, !!(b[0] && b[0].pressed) || !!(b[2] && b[2].pressed));
    nes.ctrl1.setButton(1, !!(b[1] && b[1].pressed) || !!(b[3] && b[3].pressed));
    nes.ctrl1.setButton(2, !!(b[8] && b[8].pressed));
    nes.ctrl1.setButton(3, !!(b[9] && b[9].pressed));
    nes.ctrl1.setButton(4, !!(b[12] && b[12].pressed) || ax[1] < -0.5);
    nes.ctrl1.setButton(5, !!(b[13] && b[13].pressed) || ax[1] > 0.5);
    nes.ctrl1.setButton(6, !!(b[14] && b[14].pressed) || ax[0] < -0.5);
    nes.ctrl1.setButton(7, !!(b[15] && b[15].pressed) || ax[0] > 0.5);
  }
  setInterval(pollGamepad, 16);

  function togglePause() {
    paused = !paused;
    $("btn-pause").textContent = paused ? "Resume" : "Pause";
    $("run-dot").classList.toggle("on", running && !paused);
    if (isEjs(system)) GrokEjs.setPaused(paused);
    else if (!paused) ensureAudio();
    updateHud();
  }

  function reset() {
    if (isEjs(system)) GrokEjs.reset();
    else nes.reset();
  }

  function setRewind(on) {
    rewindHeld = on;
    if (system !== "nes") GrokRewind.holdEjs(on);
    updateHud();
  }

  function setTurbo(on) {
    turbo = !!on;
    $("chk-ff").checked = turbo;
    if (isEjs(system)) GrokEjs.setTurbo(turbo);
    updateHud();
  }

  function toggleHelp() {
    $("help-overlay").hidden = !$("help-overlay").hidden;
  }

  function screenshot() {
    const data = captureShot();
    if (!data) { setHint("Nothing to capture yet."); return; }
    const a = document.createElement("a");
    const title = (currentRom.name || "screen").replace(/\.[^.]+$/, "");
    a.href = data;
    a.download = title + ".jpg";
    a.click();
    setHint("Screenshot saved");
  }

  function applyVolume() {
    if (gainNode) gainNode.gain.value = muted ? 0 : volume;
    if (isEjs(system)) GrokEjs.setVolume(volume, muted);
  }

  function openFile() { $("file").click(); }

  async function saveSlot(slot) {
    if (!currentRom.id) { setHint("Load a ROM first."); return; }
    try {
      await GrokState.capture({
        system: system,
        nes: nes,
        canvas: canvas,
        romId: currentRom.id,
        slot: slot,
        name: currentRom.name
      });
      setHint("Saved slot " + slot);
    } catch (err) {
      setHint(String(err.message || err));
    }
  }

  async function loadSlot(slot) {
    if (!currentRom.id) { setHint("Load a ROM first."); return; }
    try {
      await GrokState.restore({ system: system, nes: nes, romId: currentRom.id, slot: slot });
      if (system === "nes") blit();
      setHint("Loaded slot " + slot);
    } catch (err) {
      setHint(String(err.message || err));
    }
  }

  async function refreshStates() {
    if (!currentRom.id) {
      $("state-list").innerHTML = "<li class='note'>Load a ROM first.</li>";
      return;
    }
    const slots = await GrokState.list(currentRom.id);
    GrokState.render($("state-list"), slots, {
      save: function (i) { saveSlot(i).then(refreshStates); },
      load: function (i) { loadSlot(i).then(function () { $("state-dlg").close(); }); },
      del: function (i) { GrokState.remove(currentRom.id, i).then(refreshStates); }
    });
  }

  $("btn-pause").onclick = togglePause;
  $("btn-reset").onclick = reset;
  $("btn-load").onclick = openFile;
  $("file").onchange = function (e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.arrayBuffer().then(function (buf) { loadBytes(new Uint8Array(buf), f.name); });
    e.target.value = "";
  };
  $("btn-full").onclick = function () {
    if (!document.fullscreenElement) crt.requestFullscreen().catch(function () {});
    else document.exitFullscreen();
  };
  $("btn-mute").onclick = function () {
    muted = !muted;
    this.textContent = muted ? "Unmute" : "Mute";
    applyVolume();
    if (!muted) ensureAudio();
  };
  $("btn-shot").onclick = screenshot;
  $("chk-ff").onchange = function () { setTurbo(this.checked); };
  $("vol").oninput = function () {
    volume = Number(this.value) / 100;
    muted = volume === 0;
    $("btn-mute").textContent = muted ? "Unmute" : "Mute";
    this.setAttribute("aria-valuenow", String(this.value));
    applyVolume();
  };
  $("help-close").onclick = function () { $("help-overlay").hidden = true; };
  $("chk-crt").onchange = function () {
    crt.classList.toggle("crt-on", this.checked);
  };
  $("chk-smooth").onchange = function () {
    crt.classList.toggle("smooth", this.checked);
  };
  $("chk-touch").onchange = function () {
    GrokTouch.setForced(this.checked);
  };
  crt.classList.add("crt-on");

  $("btn-states").onclick = function () {
    refreshStates();
    $("state-dlg").showModal();
  };
  $("state-close").onclick = function () { $("state-dlg").close(); };

  $("btn-netplay").onclick = function () {
    const help = $("netplay-help");
    if (system === "nes") {
      help.textContent = "Create a room, share the code. Both of you load the same NES ROM — the file is never sent. A few frames of delay hide the ping.";
    } else {
      help.textContent = "Non-NES netplay is EmulatorJS. After the game starts, open the player Settings and look for Netplay. We do not send ROM files.";
    }
    $("netplay-dlg").showModal();
  };
  $("netplay-close").onclick = function () { $("netplay-dlg").close(); };
  $("netplay-host").onclick = async function () {
    if (system !== "nes") { $("netplay-status").textContent = "Use the emulator Settings menu for this system."; return; }
    if (!currentRom.id) { $("netplay-status").textContent = "Load a NES ROM first."; return; }
    try {
      const room = await GrokNetplay.create({
        romId: currentRom.id,
        onStatus: function (s) { $("netplay-status").textContent = s; }
      });
      $("netplay-code").value = room;
    } catch (err) {
      $("netplay-status").textContent = String(err.message || err);
    }
  };
  $("netplay-join").onclick = async function () {
    if (system !== "nes") { $("netplay-status").textContent = "Use the emulator Settings menu for this system."; return; }
    if (!currentRom.id) { $("netplay-status").textContent = "Load the same NES ROM first."; return; }
    try {
      await GrokNetplay.join($("netplay-code").value, {
        romId: currentRom.id,
        onStatus: function (s) { $("netplay-status").textContent = s; }
      });
    } catch (err) {
      $("netplay-status").textContent = String(err.message || err);
    }
  };
  $("netplay-leave").onclick = function () {
    GrokNetplay.close();
    $("netplay-status").textContent = "Left the session.";
  };

  const zone = $("drop-zone");
  const libraryEl = $("library");
  function onDrag(e) { e.preventDefault(); if (zone) zone.classList.add("drag"); }
  window.addEventListener("dragover", onDrag);
  if (libraryEl) libraryEl.addEventListener("dragover", onDrag);
  window.addEventListener("dragleave", function () { if (zone) zone.classList.remove("drag"); });
  function onDrop(e) {
    e.preventDefault();
    if (zone) zone.classList.remove("drag");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    f.arrayBuffer().then(function (buf) { loadBytes(new Uint8Array(buf), f.name); });
  }
  window.addEventListener("drop", onDrop);

  window.addEventListener("click", function () { ensureAudio(); }, { once: true });
  setInterval(function () { if (system === "nes") nes.saveRam(); }, 5000);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && currentRom.id && running) saveSlot(0).catch(function () {});
  });

  function fillDriveForm() {
    const cfg = GrokDrive.getCfg();
    $("drive-client-id").value = cfg.clientId || "";
    $("drive-api-key").value = cfg.apiKey || "";
    $("drive-app-id").value = cfg.appId || "";
  }

  function openDriveSetup() {
    fillDriveForm();
    $("drive-setup").showModal();
  }

  $("drive-cancel").onclick = function () { $("drive-setup").close(); };
  $("drive-save").onclick = function () {
    GrokDrive.saveCfg({
      clientId: $("drive-client-id").value,
      apiKey: $("drive-api-key").value,
      appId: $("drive-app-id").value
    });
    $("drive-setup").close();
    if (GrokDrive.isConfigured()) pickFromDrive();
    else setHint("Drive setup needs Client ID, API key, and project number.");
  };

  async function pickFromDrive() {
    if (!GrokDrive.isConfigured()) {
      openDriveSetup();
      return;
    }
    setHint("Opening Google Drive…");
    try {
      const picked = await GrokDrive.pickRom();
      if (!picked) {
        setHint("Drive picker cancelled.");
        return;
      }
      await loadBytes(picked.bytes, picked.name);
    } catch (err) {
      if (err && err.code === "needs-config") openDriveSetup();
      else setHint(String(err.message || err));
    }
  }
  $("btn-drive").onclick = pickFromDrive;
  GrokDrive.warmup();

  if ($("btn-demo")) {
    $("btn-demo").onclick = function () {
      loadBytes(b64ToBytes(DEMO_ROM_B64), "DEMO ROM");
    };
  }

  GrokTouch.init({
    nes: nes,
    getSystem: function () { return system; },
    onPause: togglePause,
    onRewind: setRewind,
    onTurbo: setTurbo
  });
  $("chk-touch").checked = GrokTouch.isCoarse();
  GrokTouch.setForced(GrokTouch.isCoarse());

  const folderApi = GrokFolders && GrokFolders.supported();
  let bookshelfEntries = [];

  function setFolderStatus(msg) {
    const el = $("folder-status");
    if (el) el.textContent = msg || "";
  }

  function showFolderControls(on) {
    document.querySelectorAll(".folder-api-only").forEach(function (el) {
      if (el.id === "btn-bios" && !(system === "gba" || system === "gb" || system === "gbc")) {
        el.hidden = true;
        return;
      }
      el.hidden = !on;
    });
    document.querySelectorAll(".folder-fallback").forEach(function (el) {
      el.hidden = !!on;
    });
  }

  function renderLibraryList(filter) {
    const list = $("library-list");
    if (!list) return;
    list.innerHTML = "";
    const q = String(filter || "").trim().toLowerCase();
    const rows = bookshelfEntries.filter(function (e) {
      if (!entryMatchesSystem(e)) return false;
      if (!q) return true;
      return (e.path || e.name || "").toLowerCase().indexOf(q) !== -1;
    });
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "note";
      if (!folderApi) {
        li.textContent = "Use Load ROM, drag-and-drop, or Google Drive.";
      } else if (!GrokFolders.getRomHandle()) {
        li.textContent = "Attach a folder to list " + specLabel() + " games here, or load a single file.";
      } else if (bookshelfEntries.length) {
        li.textContent = q ? "No matches." : "No " + specLabel() + " ROMs in this folder.";
      } else {
        li.textContent = "No ROMs found in this folder.";
      }
      list.appendChild(li);
      return;
    }
    rows.forEach(function (entry) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = entry.path + "  ·  " + kindGuess(entry.ext);
      btn.onclick = async function () {
        try {
          setHint("Loading “" + entry.name + "” from library…");
          const file = await GrokFolders.readEntry(entry);
          await loadBytes(file.bytes, file.name);
        } catch (err) {
          setHint(String(err.message || err));
        }
      };
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  async function refreshFolderStatus() {
    if (!folderApi) {
      setFolderStatus("");
      return;
    }
    const rom = GrokFolders.getRomHandle();
    const bios = GrokFolders.getBiosHandle();
    const bits = [];
    if (rom) bits.push("Folder: " + (rom.name || "library"));
    if (bios && (system === "gba" || system === "gb" || system === "gbc")) {
      bits.push("BIOS attached");
    }
    setFolderStatus(bits.length ? bits.join(" · ") : "No local folder attached yet (Chromium).");
  }

  async function renderBiosList() {
    const list = $("bios-list");
    const status = $("bios-status");
    if (!list || !status) return;
    list.innerHTML = "";
    const handle = GrokFolders.getBiosHandle();
    if (!handle) {
      status.textContent = "No BIOS folder attached.";
      return;
    }
    try {
      const files = await GrokFolders.listBiosFiles();
      const labels = { gba: "GBA", gb: "GB", gbc: "GBC", sgb: "SGB" };
      status.textContent = "Folder: " + (handle.name || "BIOS") + " · " +
        (files.length ? files.length + " file" + (files.length === 1 ? "" : "s") + " recognized" : "no known BIOS names found");
      files.forEach(function (f) {
        const li = document.createElement("li");
        const sys = labels[f.kind] || String(f.kind || "").toUpperCase();
        li.textContent = f.name + "  ·  " + sys + (f.preferred ? "  ·  preferred" : "");
        list.appendChild(li);
      });
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  }

  async function refreshBookshelf(opts) {
    opts = opts || {};
    const status = $("bookshelf-status");
    const handle = GrokFolders.getRomHandle();
    if (!handle) {
      bookshelfEntries = [];
      if (status) status.textContent = "No folder attached.";
      renderLibraryList(($("library-filter") && $("library-filter").value) || "");
      return;
    }
    if (status) status.textContent = "Scanning “" + (handle.name || "folder") + "”…";
    try {
      if (opts.repermission) {
        const ok = await GrokFolders.ensurePermission(handle);
        if (!ok) throw new Error("Permission denied — choose the folder again.");
      }
      bookshelfEntries = await GrokFolders.listRomLibrary();
      const n = bookshelfEntries.filter(entryMatchesSystem).length;
      if (status) {
        status.textContent = "Folder: " + (handle.name || "ROMs") + " · " + n + " " + specLabel() + " file" + (n === 1 ? "" : "s");
      }
      renderLibraryList(($("library-filter") && $("library-filter").value) || "");
    } catch (err) {
      bookshelfEntries = [];
      if (status) status.textContent = String(err.message || err);
      renderLibraryList("");
    }
    await refreshFolderStatus();
  }

  async function openBookshelf() {
    if (!folderApi) {
      setHint("Folder pickers need a Chromium browser. Use Load ROM or Drive.");
      return;
    }
    $("bookshelf-dlg").showModal();
    if (!GrokFolders.getRomHandle()) {
      await refreshBookshelf();
      return;
    }
    await refreshBookshelf({ repermission: true });
  }

  async function openBiosDlg() {
    if (!folderApi) {
      setHint("Folder pickers need a Chromium browser.");
      return;
    }
    $("bios-dlg").showModal();
    await renderBiosList();
    await refreshFolderStatus();
  }

  if (folderApi) {
    showFolderControls(true);
    $("btn-bookshelf").onclick = openBookshelf;
    $("btn-bios").onclick = openBiosDlg;

    $("bookshelf-pick").onclick = async function () {
      try {
        await GrokFolders.pickRomFolder();
        await refreshBookshelf();
        setHint("Library folder attached.");
      } catch (err) {
        if (err && err.name === "AbortError") return;
        setHint(String(err.message || err));
      }
    };
    $("bookshelf-refresh").onclick = function () { refreshBookshelf({ repermission: true }); };
    $("bookshelf-clear").onclick = async function () {
      await GrokFolders.clearRomFolder();
      bookshelfEntries = [];
      await refreshBookshelf();
      setHint("Forgot library folder.");
    };
    $("bookshelf-close").onclick = function () { $("bookshelf-dlg").close(); };
    $("library-filter").oninput = function () { renderLibraryList(this.value); };

    $("bios-pick").onclick = async function () {
      try {
        await GrokFolders.pickBiosFolder();
        await renderBiosList();
        await refreshFolderStatus();
        setHint("BIOS folder attached (kept local — never uploaded).");
      } catch (err) {
        if (err && err.name === "AbortError") return;
        setHint(String(err.message || err));
      }
    };
    $("bios-clear").onclick = async function () {
      await GrokFolders.clearBiosFolder();
      await renderBiosList();
      await refreshFolderStatus();
      setHint("Forgot BIOS folder.");
    };
    $("bios-close").onclick = function () { $("bios-dlg").close(); };

    Promise.all([
      GrokFolders.restoreRomFolder().catch(function () { return null; }),
      GrokFolders.restoreBiosFolder().catch(function () { return null; })
    ]).then(function (rows) {
      const rom = rows[0];
      if (rom && rom.needsPermission) {
        setFolderStatus("Library folder remembered — click Attach folder and allow access when prompted.");
        renderLibraryList("");
      } else {
        refreshBookshelf().then(refreshFolderStatus);
      }
    });
  } else {
    showFolderControls(false);
    renderLibraryList("");
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  applySystemChrome();
  renderRecents().catch(function () {});

  const params = new URLSearchParams(location.search);
  if (params.get("demo") === "1" && system === "nes") {
    loadBytes(b64ToBytes(DEMO_ROM_B64), "DEMO ROM");
  } else if (params.get("resume")) {
    const id = Number(params.get("resume"));
    GrokLibrary.get(id).then(function (g) {
      if (!g || g.kind !== system || !g.bytes) {
        setHint("That Continue entry is missing. Load it from the library.");
        return;
      }
      const bytes = g.bytes instanceof Uint8Array ? g.bytes : new Uint8Array(g.bytes);
      return playRom({ bytes: bytes, name: g.name, kind: g.kind });
    }).catch(function (err) {
      setHint(String(err.message || err));
    });
  }

  raf = requestAnimationFrame(frame);
})();
