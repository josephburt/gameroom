(function () {
  "use strict";

  const canvas = document.getElementById("screen");
  const ctx = canvas.getContext("2d", { alpha: false });
  const img = ctx.createImageData(256, 240);
  const img32 = new Uint32Array(img.data.buffer);
  const crt = document.getElementById("crt-wrap");
  const gbEl = document.getElementById("gb-player");

  const nes = new NES();
  let system = "nes";
  let paused = false;
  let muted = false;
  let running = false;
  let raf = 0;
  let frames = 0;
  let lastFps = performance.now();
  let audioCtx = null;
  let scriptNode = null;

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

  function setPlayingUi(name, info) {
    $("rom-name").textContent = name || "ROM";
    $("mapper-info").textContent = info;
    $("hint").textContent = "Playing “" + (name || "ROM") + "”";
    paused = false;
    $("btn-pause").textContent = "Pause";
    $("run-dot").classList.add("on");
  }

  function setSystem(next) {
    system = next;
    crt.setAttribute("data-system", next);
    document.body.setAttribute("data-system", next);
    crt.classList.toggle("is-gb", next === "gb");
    if (next === "gb") {
      $("meter-label").textContent = "System";
    } else {
      $("meter-label").textContent = "Mapper";
    }
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
        scriptNode.onaudioprocess = function (e) {
          const out = e.outputBuffer.getChannelData(0);
          if (paused || muted || !running || system !== "nes") {
            out.fill(0);
            return;
          }
          for (let i = 0; i < out.length; i++) out[i] = nes.apu.pullSample();
        };
        scriptNode.connect(audioCtx.destination);
      }
    } catch (e) {}
  }

  function loadNes(bytes, name) {
    GrokGB.stop();
    setSystem("nes");
    const cart = nes.loadRom(bytes, name);
    setPlayingUi(name, mapperLabel(cart));
    running = true;
    ensureAudio();
  }

  async function loadGb(bytes, name) {
    stopNes();
    setSystem("gb");
    setPlayingUi(name, GrokRom.gbLabel(bytes));
    $("fps").textContent = "GB";
    running = true;
    await GrokGB.start(bytes, name, {
      muted: muted,
      gameId: GrokRom.romId(bytes),
      onStart: function () {
        $("run-dot").classList.add("on");
        if (muted) GrokGB.setMuted(true);
      }
    });
  }

  function playRom(rom) {
    if (rom.kind === "nes") loadNes(rom.bytes, rom.name);
    else if (rom.kind === "gb") return loadGb(rom.bytes, rom.name);
    else throw new Error("Not a NES, Game Boy, or Game Boy Color ROM");
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
        const label = rom.kind === "gb" ? GrokRom.gbLabel(rom.bytes) : "NES";
        btn.textContent = rom.name + "  ·  " + label;
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
      const roms = await GrokRom.listRoms(bytes, name);
      if (!roms.length) {
        throw new Error("No NES / Game Boy / Game Boy Color ROM found. If this is a zip, it may use 7z/RAR — re-zip as .zip.");
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
      setHint(String(err.message || err));
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (system !== "nes" || !running || paused) return;
    nes.stepFrame();
    blit();
    frames++;
    if (now - lastFps >= 1000) {
      $("fps").textContent = frames + " FPS";
      frames = 0;
      lastFps = now;
    }
  }

  const KEYMAP = {
    ArrowRight: 7, ArrowLeft: 6, ArrowDown: 5, ArrowUp: 4,
    KeyD: 7, KeyA: 6, KeyS: 5, KeyW: 4,
    Enter: 3, ShiftLeft: 2, ShiftRight: 2, Space: 2,
    KeyX: 1, KeyK: 1,
    KeyZ: 0, KeyJ: 0
  };

  window.addEventListener("keydown", function (e) {
    if (e.code === "KeyP") { togglePause(); e.preventDefault(); return; }
    if (e.code === "KeyR" && (e.metaKey || e.ctrlKey)) return;
    if (e.code === "KeyR") { reset(); e.preventDefault(); return; }
    if (system !== "nes") return;
    const b = KEYMAP[e.code];
    if (b !== undefined) {
      nes.ctrl1.setButton(b, true);
      e.preventDefault();
      ensureAudio();
    }
  });
  window.addEventListener("keyup", function (e) {
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
    if (system === "gb") GrokGB.setPaused(paused);
    else if (!paused) ensureAudio();
  }

  function reset() {
    if (system === "gb") GrokGB.reset();
    else nes.reset();
  }

  function openFile() { $("file").click(); }

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
    if (system === "gb") GrokGB.setMuted(muted);
    else if (!muted) ensureAudio();
  };
  $("chk-crt").onchange = function () {
    crt.classList.toggle("crt-on", this.checked);
  };
  $("chk-smooth").onchange = function () {
    crt.classList.toggle("smooth", this.checked);
  };
  crt.classList.add("crt-on");

  const zone = $("drop-zone");
  window.addEventListener("dragover", function (e) { e.preventDefault(); zone.classList.add("drag"); });
  window.addEventListener("dragleave", function () { zone.classList.remove("drag"); });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
    zone.classList.remove("drag");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    f.arrayBuffer().then(function (buf) { loadBytes(new Uint8Array(buf), f.name); });
  });

  window.addEventListener("click", function () { ensureAudio(); }, { once: true });
  setInterval(function () { if (system === "nes") nes.saveRam(); }, 5000);

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

  $("drive-cancel").onclick = function () {
    $("drive-setup").close();
  };
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

  loadBytes(b64ToBytes(DEMO_ROM_B64), "DEMO ROM");
  raf = requestAnimationFrame(frame);
})();
