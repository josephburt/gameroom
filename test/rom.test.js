"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, b64ToBytes } = require("./load-browser-scripts");

loadScript("js/rom.js");
loadScript("js/demo-rom.js");
loadScript("js/systems.js");

describe("GrokRom.detect", () => {
  it("detects the built-in NES demo by header", () => {
    const bytes = b64ToBytes(DEMO_ROM_B64);
    assert.equal(GrokRom.detect(bytes, "DEMO.nes"), "nes");
    assert.equal(GrokRom.isNes(bytes), true);
  });

  it("detects N64 z64 magic", () => {
    const bytes = new Uint8Array(0x40);
    bytes[0] = 0x80; bytes[1] = 0x37; bytes[2] = 0x12; bytes[3] = 0x40;
    assert.equal(GrokRom.isN64(bytes), true);
    assert.equal(GrokRom.detect(bytes, "game.bin"), "n64");
  });

  it("detects .z64 / .n64 / .v64 by extension", () => {
    const empty = new Uint8Array(16);
    assert.equal(GrokRom.detect(empty, "Mario64.z64"), "n64");
    assert.equal(GrokRom.detect(empty, "Mario64.n64"), "n64");
    assert.equal(GrokRom.detect(empty, "Mario64.v64"), "n64");
  });

  it("does not treat a Genesis header as a supported system", () => {
    const bytes = new Uint8Array(0x200);
    const label = "SEGA MEGA DRIVE ";
    for (let i = 0; i < label.length; i++) bytes[0x100 + i] = label.charCodeAt(i);
    assert.equal(GrokRom.detect(bytes, "sonic.bin"), null);
  });
});

describe("GrokRom.romId", () => {
  it("is stable for the same bytes", () => {
    const bytes = b64ToBytes(DEMO_ROM_B64);
    const a = GrokRom.romId(bytes);
    const b = GrokRom.romId(bytes);
    assert.equal(a, b);
    assert.ok(a > 0);
  });

  it("changes when content changes", () => {
    const a = GrokRom.romId(new Uint8Array([1, 2, 3, 4]));
    const b = GrokRom.romId(new Uint8Array([1, 2, 3, 5]));
    assert.notEqual(a, b);
  });
});

describe("GrokRom.systemLabel", () => {
  it("labels Nintendo 64", () => {
    assert.equal(GrokRom.systemLabel("n64"), "Nintendo 64");
  });
});

describe("GrokSystems catalog", () => {
  it("lists the six live systems", () => {
    assert.deepEqual(GrokSystems.order, ["nes", "snes", "n64", "gb", "gbc", "gba"]);
    assert.equal(GrokSystems.isEjs("nes"), false);
    assert.equal(GrokSystems.isEjs("n64"), true);
    assert.equal(GrokSystems.isEjs("snes"), true);
  });
});
