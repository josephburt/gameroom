/* NES rewind ring buffer. GB/SNES uses EmulatorJS rewind when available. */
(function (g) {
  "use strict";

  function Ring(capacity) {
    this.cap = capacity;
    this.buf = new Array(capacity);
    this.len = 0;
    this.w = 0;
  }
  Ring.prototype.push = function (bytes) {
    this.buf[this.w] = bytes;
    this.w = (this.w + 1) % this.cap;
    if (this.len < this.cap) this.len++;
  };
  Ring.prototype.pop = function () {
    if (this.len <= 1) return this.buf[(this.w - 1 + this.cap) % this.cap] || null;
    this.len--;
    this.w = (this.w - 1 + this.cap) % this.cap;
    return this.buf[(this.w - 1 + this.cap) % this.cap] || null;
  };
  Ring.prototype.clear = function () {
    this.len = 0;
    this.w = 0;
  };

  const nesRing = new Ring(150);
  let frameCount = 0;
  let holding = false;

  function reset() {
    nesRing.clear();
    frameCount = 0;
    holding = false;
  }

  function onNesFrame(nes) {
    if (holding) return;
    frameCount++;
    if (frameCount % 2) return;
    try { nesRing.push(nes.serialize()); } catch (e) {}
  }

  function holdNes(nes, on) {
    holding = on;
    if (!on) return true;
    const st = nesRing.pop();
    if (!st) return false;
    try {
      nes.deserialize(st);
      return true;
    } catch (e) {
      return false;
    }
  }

  function holdEjs(on) {
    holding = on;
    return g.GrokEjs.setRewind(on);
  }

  g.GrokRewind = {
    reset: reset,
    onNesFrame: onNesFrame,
    holdNes: holdNes,
    holdEjs: holdEjs,
    isHolding: function () { return holding; }
  };
})(typeof window !== "undefined" ? window : globalThis);
