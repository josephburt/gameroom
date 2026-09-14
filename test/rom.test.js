"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, b64ToBytes } = require("./load-browser-scripts");

loadScript("js/rom.js");
loadScript("js/demo-rom.js");

describe("GrokRom.detect", () => {
  it("detects the built-in NES demo by header", () => {
    const bytes = b64ToBytes(DEMO_ROM_B64);
    assert.equal(GrokRom.detect(bytes, "DEMO.nes"), "nes");
    assert.equal(GrokRom.isNes(bytes), true);
  });

  it("detects PBP magic as PlayStation", () => {
    const bytes = new Uint8Array([0x00, 0x50, 0x42, 0x50, 0, 0, 0, 0]);
    assert.equal(GrokRom.isPbp(bytes), true);
    assert.equal(GrokRom.detect(bytes, "game.bin"), "ps1");
  });

  it("detects .pbp / .cue by extension", () => {
    const empty = new Uint8Array(16);
    assert.equal(GrokRom.detect(empty, "Crash.pbp"), "ps1");
    assert.equal(GrokRom.detect(empty, "Crash.cue"), "ps1");
  });

  it("treats bare .bin as PS1 only when preferred", () => {
    const empty = new Uint8Array(16);
    assert.equal(GrokRom.detect(empty, "track01.bin"), null);
    assert.equal(GrokRom.detect(empty, "track01.bin", "ps1"), "ps1");
  });

  it("detects Genesis by SEGA header, not as PS1", () => {
    const bytes = new Uint8Array(0x200);
    const label = "SEGA MEGA DRIVE ";
    for (let i = 0; i < label.length; i++) bytes[0x100 + i] = label.charCodeAt(i);
    assert.equal(GrokRom.detect(bytes, "sonic.bin"), "genesis");
    assert.equal(GrokRom.detect(bytes, "sonic.bin", "ps1"), "genesis");
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
  it("labels PlayStation", () => {
    assert.equal(GrokRom.systemLabel("ps1"), "PlayStation");
  });
});
