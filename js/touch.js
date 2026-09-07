/* On-screen pad. Pointer events → keyboard codes (and NES buttons). */
(function (g) {
  "use strict";

  const NES_KEY = {
    KeyZ: 0, KeyX: 1, ShiftLeft: 2, Enter: 3,
    ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7
  };

  let overlay = null;
  let dpad = null;
  let nes = null;
  let getSystem = function () { return "nes"; };
  let onPause = null;
  let onRewind = null;
  let onTurbo = null;
  const held = {};
  const dpadHeld = { up: false, down: false, left: false, right: false };

  function dispatch(code, down) {
    const ev = new KeyboardEvent(down ? "keydown" : "keyup", {
      code: code,
      key: code,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(ev);
    if (nes && getSystem() === "nes" && NES_KEY[code] !== undefined) {
      nes.ctrl1.setButton(NES_KEY[code], down);
    }
  }

  function setKey(code, down) {
    if (!code) return;
    if (!!held[code] === !!down) return;
    held[code] = down;
    dispatch(code, down);
  }

  function setDpad(next) {
    const map = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
    Object.keys(map).forEach(function (dir) {
      setKey(map[dir], !!next[dir]);
      dpadHeld[dir] = !!next[dir];
    });
  }

  function dpadFromEvent(e) {
    const r = dpad.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    const dead = 0.18;
    return {
      left: x < -dead,
      right: x > dead,
      up: y < -dead,
      down: y > dead
    };
  }

  function bindHold(el, downFn, upFn) {
    let ptr = null;
    function start(e) {
      e.preventDefault();
      ptr = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      el.classList.add("is-down");
      downFn(e);
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) {}
    }
    function end(e) {
      if (ptr !== null && e.pointerId !== ptr && e.type !== "pointercancel") return;
      ptr = null;
      el.classList.remove("is-down");
      e.preventDefault();
      upFn(e);
    }
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  }

  function init(opts) {
    overlay = document.getElementById("touch-overlay");
    dpad = document.getElementById("touch-dpad");
    nes = opts.nes;
    getSystem = opts.getSystem || getSystem;
    onPause = opts.onPause;
    onRewind = opts.onRewind;
    onTurbo = opts.onTurbo;
    if (!overlay || !dpad) return;

    overlay.querySelectorAll("[data-key]").forEach(function (btn) {
      const code = btn.getAttribute("data-key");
      bindHold(btn, function () { setKey(code, true); }, function () { setKey(code, false); });
    });

    const pauseBtn = overlay.querySelector("[data-act='pause']");
    if (pauseBtn) pauseBtn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      if (onPause) onPause();
    });

    const rw = overlay.querySelector("[data-act='rewind']");
    if (rw) bindHold(rw, function () { if (onRewind) onRewind(true); }, function () { if (onRewind) onRewind(false); });
    const ff = overlay.querySelector("[data-act='turbo']");
    if (ff) bindHold(ff, function () { if (onTurbo) onTurbo(true); }, function () { if (onTurbo) onTurbo(false); });

    let dpadPtr = null;
    dpad.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      dpadPtr = e.pointerId;
      try { dpad.setPointerCapture(e.pointerId); } catch (err) {}
      setDpad(dpadFromEvent(e));
    });
    dpad.addEventListener("pointermove", function (e) {
      if (dpadPtr !== e.pointerId) return;
      e.preventDefault();
      setDpad(dpadFromEvent(e));
    });
    function dpadEnd(e) {
      if (dpadPtr !== e.pointerId && e.type !== "pointercancel") return;
      dpadPtr = null;
      setDpad({ up: false, down: false, left: false, right: false });
    }
    dpad.addEventListener("pointerup", dpadEnd);
    dpad.addEventListener("pointercancel", dpadEnd);

    syncLayout();
    window.addEventListener("resize", syncLayout);
  }

  function isCoarse() {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  }

  function systemsFor(el) {
    const raw = el.getAttribute("data-systems") || "";
    return raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function syncFaceLabels(sys) {
    const faceX = overlay.querySelector(".face-x");
    const faceY = overlay.querySelector(".face-y");
    // EJS defaultControls: KeyV=BUTTON_3 (SNES X / Genesis C), KeyC=BUTTON_4 (Y).
    if (faceX) {
      const lab = sys === "genesis" ? "C" : "X";
      faceX.textContent = lab;
      faceX.setAttribute("aria-label", lab);
    }
    if (faceY) {
      faceY.textContent = "Y";
      faceY.setAttribute("aria-label", "Y");
    }
  }

  function syncLayout() {
    if (!overlay) return;
    const sys = getSystem();
    overlay.setAttribute("data-system", sys);
    const show = overlay.toggleForced || isCoarse();
    overlay.hidden = !show;
    overlay.querySelectorAll("[data-systems]").forEach(function (el) {
      const list = systemsFor(el);
      el.hidden = list.indexOf(sys) === -1;
    });
    syncFaceLabels(sys);
  }

  function setForced(on) {
    if (!overlay) return;
    overlay.toggleForced = !!on;
    syncLayout();
  }

  g.GrokTouch = {
    init: init,
    sync: syncLayout,
    setForced: setForced,
    isCoarse: isCoarse
  };
})(typeof window !== "undefined" ? window : globalThis);
