(function () {
  "use strict";

  const canvas = document.getElementById("screen");
  const ctx = canvas.getContext("2d", { alpha: false });
  const img = ctx.createImageData(256, 240);
  const img32 = new Uint32Array(img.data.buffer);
  const crt = document.getElementById("crt-wrap");

  const nes = new NES();
  let system = "nes";
  let selectedSystem = "nes";
  let paused = false;
  let muted = false;
  let running = false;
  let raf = 0;
  let frames = 0;
  let lastFps = performance.now();
  let audioCtx = null;
  let scriptNode = null;
  let currentRom = { bytes: null, name: "", id: 0, kind: "nes" };
  let rewindHeld = false;
  let view = "home";
  let volume = 0.7;
  let turbo = false;
  let gainNode = null;
  let installEvt = null;
  let shotTimer = 0;

  const SYSTEMS = {
    nes: {
      label: "NES",
      accept: ".nes,.NES,.unf,.zip,.ZIP",
      meter: "Mapper",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A", "X / J"],
        ["B", "Z / K"],
        ["Start", "Enter"],
        ["Select", "Shift / Space"],
        ["Rewind", "Hold Backspace"],
        ["Turbo", "Hold Tab"]
      ],
      note: "Xbox / DualShock / generic pads work after you press a button. Netplay is a room code for NES."
    },
    gb: {
      label: "Game Boy",
      accept: ".gb,.GB,.zip,.ZIP",
      meter: "System",
      core: "gb",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A", "X / J"],
        ["B", "Z / K"],
        ["Start", "Enter"],
        ["Select", "Shift"]
      ],
      note: "Game Boy cores also accept their own mapping in Settings. Netplay is in the emulator settings menu."
    },
    gbc: {
      label: "Game Boy Color",
      accept: ".gbc,.GBC,.gb,.GB,.zip,.ZIP",
      meter: "System",
      core: "gb",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A", "X / J"],
        ["B", "Z / K"],
        ["Start", "Enter"],
        ["Select", "Shift"]
      ],
      note: "Game Boy Color uses the same core as Game Boy. Netplay is in the emulator settings menu."
    },
    snes: {
      label: "Super NES",
      accept: ".sfc,.SFC,.smc,.SMC,.fig,.zip,.ZIP",
      meter: "System",
      core: "snes",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A / B", "X / Z"],
        ["X / Y", "V / C"],
        ["L / R", "Q / E"],
        ["Start / Select", "Enter / Shift"],
        ["Rewind", "Hold Backspace (NES) or emulator settings"],
        ["Turbo", "Hold Tab"]
      ],
      note: "Star Fox and other Super FX games run through snes9x. First load fetches the core; after that it stays cached."
    },
    gba: {
      label: "Game Boy Advance",
      accept: ".gba,.GBA,.agb,.AGB,.zip,.ZIP",
      meter: "System",
      core: "gba",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A / B", "X / Z"],
        ["L / R", "Q / E"],
        ["Start / Select", "Enter / Shift"],
        ["Turbo", "Hold Tab"]
      ],
      note: "GBA runs through EmulatorJS mgba (core id gba). Optional BIOS is not bundled — attach a BIOS folder if you own gba_bios.bin. Most games boot without it."
    },
    genesis: {
      label: "Sega Genesis",
      accept: ".md,.MD,.gen,.GEN,.smd,.SMD,.zip,.ZIP",
      meter: "System",
      core: "segaMD",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A / B / C", "Z / X / C"],
        ["X / Y / Z", "A / S / D (via emulator map)"],
        ["Start", "Enter"],
        ["Turbo", "Hold Tab"]
      ],
      note: "Genesis / Mega Drive uses EmulatorJS segaMD (genesis_plus_gx). First load fetches the core from the CDN."
    }
  };

  const KEYMAP = {
    ArrowRight: 7, ArrowLeft: 6, ArrowDown: 5, ArrowUp: 4,
    KeyD: 7, KeyA: 6, KeyS: 5, KeyW: 4,
    Enter: 3, ShiftLeft: 2, ShiftRight: 2, Space: 2,
    KeyX: 0, KeyJ: 0,
    KeyZ: 1, KeyK: 1
  };

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

  function updateRoomTv(sys) {
    const sub = $("room-tv-sub");
    const screen = $("room-tv-screen");
    if (!sub) return;
    const spec = SYSTEMS[sys];
    if (spec) {
      sub.textContent = "AV-1 · " + spec.label + " selected — load a ROM";
    } else {
      sub.textContent = "AV-1 · pick a console";
    }
    if (screen) screen.setAttribute("data-signal", spec ? "standby" : "off");
  }


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
      const tmp = document.createElement("canvas");
      tmp.width = 256;
      tmp.height = 224;
      tmp.getContext("2d").drawImage(src, 0, 0, 256, 224);
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

  async function renderRecents() {
    const wrap = $("recents-wrap");
    const root = $("recents");
    if (!wrap || !root) return;
    const games = await GrokLibrary.list();
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
      card.setAttribute("data-id", String(g.id));
      const open = document.createElement("button");
      open.type = "button";
      open.className = "recent-open";
      open.setAttribute("aria-label", "Continue " + (g.title || g.name));
      const thumb = g.shot
        ? "<img alt=\"\" src=\"" + g.shot + "\" />"
        : "<div class=\"recent-ph\" aria-hidden=\"true\"></div>";
      open.innerHTML = thumb +
        "<div class=\"recent-meta\"><strong>" + escapeHtml(g.title || g.name) + "</strong><span>" +
        (SYSTEMS[g.kind] ? SYSTEMS[g.kind].label : g.kind) + "</span></div>";
      open.onclick = function () {
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
      x.title = "Remove";
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

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function isEjs(sys) { return sys === "gb" || sys === "gbc" || sys === "snes" || sys === "gba" || sys === "genesis"; }

  function renderKeys(sys) {
    const spec = SYSTEMS[sys] || SYSTEMS.nes;
    const table = $("keys-table");
    table.innerHTML = spec.keys.map(function (row) {
      return "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>";
    }).join("");
    $("keys-note").textContent = spec.note;
  }

  function setSystem(next) {
    system = next;
    selectedSystem = next;
    crt.setAttribute("data-system", next);
    document.body.setAttribute("data-system", next);
    crt.classList.toggle("is-ejs", isEjs(next));
    const spec = SYSTEMS[next] || SYSTEMS.nes;
    $("meter-label").textContent = spec.meter;
    $("file").accept = spec.accept;
    renderKeys(next);
    document.querySelectorAll(".sys-card").forEach(function (c) {
      c.classList.toggle("selected", c.getAttribute("data-sys") === next);
    });
    if (window.GrokTouch) GrokTouch.sync();
    updateRoomTv(next);
  }

  function showHome() {
    view = "home";
    document.body.classList.add("view-home");
    document.body.classList.remove("view-play", "sheet-open", "rom-loaded");
    $("home").hidden = false;
    $("play").hidden = true;
    const sheet = $("btn-sheet");
    if (sheet) sheet.setAttribute("aria-expanded", "false");
    if (running && !paused) togglePause();
    renderRecents().catch(function () {});
    document.querySelectorAll(".side-nav-item").forEach(function (btn) {
      const on = btn.getAttribute("data-nav") === "consoles";
      btn.classList.toggle("is-active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    const focusCard = document.querySelector(".sys-card.selected:not(.is-soon)") || document.querySelector(".sys-card:not(.is-soon)");
    if (focusCard) setTimeout(function () { focusCard.focus(); }, 0);
  }

  function showPlay() {
    view = "play";
    document.body.classList.add("view-play");
    document.body.classList.remove("view-home");
    $("home").hidden = true;
    $("play").hidden = false;
    if (window.GrokTouch) GrokTouch.sync();
    const loadBtn = $("btn-load");
    if (loadBtn && !currentRom.id) setTimeout(function () { loadBtn.focus(); }, 0);
  }

  function setPlayingUi(name, info) {
    $("rom-name").textContent = name || "ROM";
    $("mapper-info").textContent = info;
    $("hint").textContent = "Playing “" + (name || "ROM") + "”";
    paused = false;
    $("btn-pause").textContent = "Pause";
    $("run-dot").classList.add("on");
    document.body.classList.add("rom-loaded");
    showPlay();
    updateHud();
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
    setSystem("nes");
    const cart = nes.loadRom(bytes, name);
    currentRom = { bytes: bytes, name: name, id: GrokRom.romId(bytes), kind: "nes" };
    GrokRewind.reset();
    setPlayingUi(name, mapperLabel(cart));
    running = true;
    frames = 0;
    lastFps = performance.now();
    ensureAudio();
    rememberCurrent();
    scheduleShot();
    hideBoot();
  }

  async function loadEjs(bytes, name, kind) {
    stopNes();
    GrokNetplay.close();
    setSystem(kind);
    currentRom = { bytes: bytes, name: name, id: GrokRom.romId(bytes), kind: kind };
    GrokRewind.reset();
    const spec = SYSTEMS[kind];
    const title = GrokRom.prettyName(kind, bytes, name);
    setPlayingUi(title, GrokRom.systemLabel(kind, bytes));
    $("fps").textContent = spec.label;
    running = true;
    showBoot(title, spec.label, "Loading the " + spec.label + " core. First time can take a bit — Super FX games like Star Fox need it.");
    let biosUrl = "";
    try {
      if (GrokFolders && (kind === "gba" || kind === "gb" || kind === "gbc")) {
        biosUrl = await GrokFolders.biosUrlFor(kind);
      }
    } catch (e) {
      biosUrl = "";
    }
    await GrokEjs.start(bytes, name, {
      muted: muted,
      volume: volume,
      core: spec.core,
      biosUrl: biosUrl,
      color: ({ snes: "#7b68ee", gba: "#6b8afd", genesis: "#1aa3ff", gb: "#9bbc0f", gbc: "#a78bfa" })[kind] || "#ff3b4e",
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
    if (rom.kind === "nes") loadNes(rom.bytes, rom.name);
    else if (isEjs(rom.kind)) {
      return loadEjs(rom.bytes, rom.name, rom.kind);
    } else throw new Error("Unsupported ROM — Phase 1 supports NES, SNES, GB, GBC, GBA, and Genesis");
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
      showPlay();
      const roms = await GrokRom.listRoms(bytes, name);
      if (!roms.length) {
        throw new Error("No supported ROM found (NES / SNES / GB / GBC / GBA / Genesis). If this is a zip, re-zip as .zip (not 7z/RAR).");
      }
      let rom = roms[0];
      if (roms.length > 1) {
        setHint(roms.length + " ROMs in this zip — pick one");
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

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (system !== "nes" || !running) return;
    if (rewindHeld) {
      GrokRewind.holdNes(nes, true);
      blit();
      return;
    }
    if (paused) return;
    const local = nes.ctrl1.buttons;
    const net = GrokNetplay.consume(local);
    if (net.active) {
      if (net.stall) {
        $("fps").textContent = "WAIT";
        return;
      }
      nes.ctrl1.buttons = net.p1;
      nes.ctrl2.buttons = net.p2;
    }
    nes.stepFrame();
    if (turbo) {
      nes.stepFrame();
      nes.stepFrame();
    }
    if (net.active) nes.ctrl1.buttons = local;
    GrokRewind.onNesFrame(nes);
    blit();
    frames++;
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
      if (document.body.classList.contains("sheet-open")) {
        document.body.classList.remove("sheet-open");
        $("btn-sheet").setAttribute("aria-expanded", "false");
        e.preventDefault();
        return;
      }
      if (view === "play") { showHome(); e.preventDefault(); return; }
    }
    if (e.code === "KeyP") { togglePause(); e.preventDefault(); return; }
    if (e.code === "KeyR" && (e.metaKey || e.ctrlKey)) return;
    if (e.code === "KeyR") { reset(); e.preventDefault(); return; }
    if (e.code === "Backspace" || e.code === "F1") {
      e.preventDefault();
      setRewind(true);
      return;
    }
    if (e.code === "F5") { e.preventDefault(); saveSlot(0); return; }
    if (e.code === "F7") { e.preventDefault(); loadSlot(0); return; }
    if (e.code === "F8") { e.preventDefault(); screenshot(); return; }
    if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) { e.preventDefault(); toggleHelp(); return; }
    if (e.code === "Tab") { e.preventDefault(); setTurbo(true); return; }
    if (system !== "nes") return;
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
  $("btn-load-home").onclick = function () {
    $("file").accept = ".nes,.NES,.unf,.gb,.GB,.gbc,.GBC,.gba,.GBA,.sfc,.SFC,.smc,.SMC,.fig,.md,.MD,.gen,.GEN,.smd,.SMD,.zip,.ZIP";
    openFile();
  };
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

  $("btn-sheet").onclick = function () {
    const open = document.body.classList.toggle("sheet-open");
    this.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const zone = $("drop-zone");
  function onDrag(e) { e.preventDefault(); if (zone) zone.classList.add("drag"); }
  window.addEventListener("dragover", onDrag);
  $("home").addEventListener("dragover", onDrag);
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
    showPlay();
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
  $("btn-drive-home").onclick = pickFromDrive;
  GrokDrive.warmup();

  function setSideNav(active) {
    document.querySelectorAll(".side-nav-item").forEach(function (btn) {
      const on = btn.getAttribute("data-nav") === active;
      btn.classList.toggle("is-active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
  }

  function openAbout() {
    setSideNav("about");
    const dlg = $("about-dlg");
    if (dlg && dlg.showModal) dlg.showModal();
  }

  function openCheats() {
    setSideNav("cheats");
    const dlg = $("cheats-dlg");
    if (dlg && dlg.showModal) dlg.showModal();
  }

  function openSettingsHome() {
    setSideNav("settings");
    const crtHome = $("chk-crt-home");
    const touchHome = $("chk-touch-home");
    if (crtHome && $("chk-crt")) crtHome.checked = $("chk-crt").checked;
    if (touchHome && $("chk-touch")) touchHome.checked = $("chk-touch").checked;
    const dlg = $("settings-home-dlg");
    if (dlg && dlg.showModal) dlg.showModal();
  }

  async function openSavedGames() {
    setSideNav("saves");
    if (currentRom.id && system === "nes") {
      // Prefer existing save-state UI when a NES ROM is active
      showPlay();
      if ($("btn-states")) $("btn-states").click();
      return;
    }
    await renderRecents();
    const wrap = $("recents-wrap");
    if (wrap && !wrap.hidden) {
      wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const first = wrap.querySelector(".recent-open");
      if (first) first.focus();
      return;
    }
    // Lightweight stub when nothing is saved yet
    setHint("No saved games yet — load a ROM, then use Save states from the play panel.");
    if ($("state-dlg") && $("state-dlg").showModal) {
      // Reuse state dialog shell as empty stub messaging via list
      const list = $("state-list");
      if (list) list.innerHTML = "<li class='note'>No save states in this browser yet. Load a ROM first, then open Save states from the emulator panel.</li>";
      $("state-dlg").showModal();
    }
  }

  function focusConsoles() {
    setSideNav("consoles");
    const room = document.querySelector(".room--photo");
    if (room) room.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const focusCard = document.querySelector(".sys-card.selected:not(.is-soon)") || document.querySelector(".sys-card:not(.is-soon)");
    if (focusCard) focusCard.focus();
  }

  document.querySelectorAll("[data-nav]").forEach(function (el) {
    el.addEventListener("click", function () {
      const nav = el.getAttribute("data-nav");
      if (nav === "consoles") focusConsoles();
      else if (nav === "saves") openSavedGames();
      else if (nav === "cheats") openCheats();
      else if (nav === "settings") openSettingsHome();
      else if (nav === "about") openAbout();
    });
  });

  if ($("about-close")) $("about-close").onclick = function () { $("about-dlg").close(); setSideNav("consoles"); };
  if ($("cheats-close")) $("cheats-close").onclick = function () { $("cheats-dlg").close(); setSideNav("consoles"); };
  if ($("settings-home-close")) {
    $("settings-home-close").onclick = function () {
      const crtHome = $("chk-crt-home");
      const touchHome = $("chk-touch-home");
      if (crtHome && $("chk-crt")) {
        $("chk-crt").checked = crtHome.checked;
        $("chk-crt").dispatchEvent(new Event("change"));
      }
      if (touchHome && $("chk-touch")) {
        $("chk-touch").checked = touchHome.checked;
        $("chk-touch").dispatchEvent(new Event("change"));
      }
      $("settings-home-dlg").close();
      setSideNav("consoles");
    };
  }

  if ($("btn-continue-home")) {
    $("btn-continue-home").onclick = function () {
      openSavedGames();
    };
  }

  document.querySelectorAll(".sys-card").forEach(function (card) {
    card.onclick = function () {
      if (card.classList.contains("is-soon") || card.disabled || card.getAttribute("aria-disabled") === "true") return;
      const sys = card.getAttribute("data-sys");
      if (!sys || !SYSTEMS[sys]) return;
      if (sys === system && currentRom.id) {
        showPlay();
        if (paused) togglePause();
        return;
      }
      setSystem(sys);
      document.body.classList.remove("rom-loaded");
      $("rom-name").textContent = SYSTEMS[sys].label;
      $("mapper-info").textContent = "No ROM";
      $("run-dot").classList.remove("on");
      setHint("Load a " + SYSTEMS[sys].label + " ROM, or drop one here");
      $("fps").textContent = "-- FPS";
      running = false;
      currentRom = { bytes: null, name: "", id: 0, kind: sys };
      showPlay();
      if (sys !== "nes") {
        stopNes();
        GrokEjs.stop();
        crt.classList.add("is-ejs");
      } else {
        GrokEjs.stop();
        crt.classList.remove("is-ejs");
      }
    };
  });

  $("btn-home").onclick = showHome;
  $("btn-demo").onclick = function () {
    loadBytes(b64ToBytes(DEMO_ROM_B64), "DEMO ROM");
  };

  GrokTouch.init({
    nes: nes,
    getSystem: function () { return system; },
    onPause: togglePause,
    onRewind: setRewind,
    onTurbo: setTurbo
  });
  $("chk-touch").checked = GrokTouch.isCoarse();
  GrokTouch.setForced(GrokTouch.isCoarse());

  /* —— Local folder pickers (Chromium File System Access API) —— */
  const folderApi = GrokFolders && GrokFolders.supported();

  function setFolderStatus(msg) {
    const el = $("folder-status");
    if (el) el.textContent = msg || "";
  }

  function showFolderControls(on) {
    document.querySelectorAll(".folder-api-only").forEach(function (el) {
      el.hidden = !on;
    });
    document.querySelectorAll(".folder-fallback").forEach(function (el) {
      el.hidden = !!on;
    });
  }

  function kindGuess(ext) {
    if (ext === "nes" || ext === "unf" || ext === "unif" || ext === "fds") return "NES";
    if (ext === "gbc") return "GBC";
    if (ext === "gb" || ext === "sgb" || ext === "dmg") return "GB";
    if (ext === "gba" || ext === "agb" || ext === "mb") return "GBA";
    if (ext === "sfc" || ext === "smc" || ext === "fig" || ext === "swc") return "SNES";
    if (ext === "md" || ext === "gen" || ext === "smd") return "Genesis";
    if (ext === "zip") return "ZIP";
    return ext.toUpperCase();
  }

  async function refreshFolderStatus() {
    if (!folderApi) {
      setFolderStatus("");
      return;
    }
    const rom = GrokFolders.getRomHandle();
    const bios = GrokFolders.getBiosHandle();
    const bits = [];
    if (rom) bits.push("Bookshelf: " + (rom.name || "folder"));
    if (bios) {
      let n = 0;
      try { n = (await GrokFolders.listBiosFiles()).length; } catch (e) {}
      bits.push("BIOS: " + (bios.name || "folder") + (n ? " (" + n + " file" + (n === 1 ? "" : "s") + ")" : ""));
    }
    setFolderStatus(bits.length ? bits.join(" · ") : "No local folders attached yet (Chromium).");
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
      status.textContent = "Folder: " + (handle.name || "BIOS") + " · " + (files.length ? files.length + " recognized" : "no known BIOS names found");
      files.forEach(function (f) {
        const li = document.createElement("li");
        li.textContent = f.name + "  ·  " + f.kind.toUpperCase();
        list.appendChild(li);
      });
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  }

  let bookshelfEntries = [];

  function renderBookshelfList(filter) {
    const list = $("bookshelf-list");
    if (!list) return;
    list.innerHTML = "";
    const q = String(filter || "").trim().toLowerCase();
    const rows = bookshelfEntries.filter(function (e) {
      if (!q) return true;
      return (e.path || e.name || "").toLowerCase().indexOf(q) !== -1;
    });
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "note";
      li.textContent = bookshelfEntries.length ? "No matches." : "No ROMs found in this folder.";
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
          setHint("Loading “" + entry.name + "” from bookshelf…");
          $("bookshelf-dlg").close();
          showPlay();
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

  async function refreshBookshelf(opts) {
    opts = opts || {};
    const status = $("bookshelf-status");
    const handle = GrokFolders.getRomHandle();
    if (!handle) {
      bookshelfEntries = [];
      if (status) status.textContent = "No folder attached.";
      renderBookshelfList("");
      return;
    }
    if (status) status.textContent = "Scanning “" + (handle.name || "folder") + "”…";
    try {
      if (opts.repermission) {
        const ok = await GrokFolders.ensurePermission(handle);
        if (!ok) throw new Error("Permission denied — choose the folder again.");
      }
      bookshelfEntries = await GrokFolders.listRomLibrary();
      if (status) {
        status.textContent = "Folder: " + (handle.name || "ROMs") + " · " + bookshelfEntries.length + " file" + (bookshelfEntries.length === 1 ? "" : "s");
      }
      renderBookshelfList(($("bookshelf-filter") && $("bookshelf-filter").value) || "");
    } catch (err) {
      bookshelfEntries = [];
      if (status) status.textContent = String(err.message || err);
      renderBookshelfList("");
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
    $("btn-bookshelf-home").onclick = openBookshelf;
    $("btn-bios").onclick = openBiosDlg;
    $("btn-bios-home").onclick = openBiosDlg;

    $("bookshelf-pick").onclick = async function () {
      try {
        await GrokFolders.pickRomFolder();
        await refreshBookshelf();
        setHint("Bookshelf folder attached.");
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
      setHint("Forgot bookshelf folder.");
    };
    $("bookshelf-close").onclick = function () { $("bookshelf-dlg").close(); };
    $("bookshelf-filter").oninput = function () { renderBookshelfList(this.value); };

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
      const bios = rows[1];
      if (rom && rom.needsPermission) {
        setFolderStatus("Bookshelf folder remembered — open Bookshelf and allow access when prompted.");
      } else if (bios && bios.needsPermission) {
        setFolderStatus("BIOS folder remembered — open BIOS and allow access when prompted.");
      } else {
        refreshFolderStatus();
      }
    });
  } else {
    showFolderControls(false);
  }

    if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvt = e;
    $("btn-install").hidden = false;
  });
  $("btn-install").onclick = function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.finally(function () {
      installEvt = null;
      $("btn-install").hidden = true;
    });
  };

  setSystem("nes");
  showHome();
  renderRecents().catch(function () {});
  raf = requestAnimationFrame(frame);
})();
