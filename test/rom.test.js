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

describe("GrokRom PS1 disc-set helpers", () => {
  it("recognizes a cue+bin file list as a PS1 disc set", () => {
    const files = [
      { name: "game.cue", bytes: new Uint8Array(8) },
      { name: "game.bin", bytes: new Uint8Array(8) }
    ];
    assert.equal(GrokRom.zipIsPs1DiscSet(files), true);
  });

  it("rejects a disc set when a foreign ROM is mixed in", () => {
    const files = [
      { name: "game.cue", bytes: new Uint8Array(8) },
      { name: "game.bin", bytes: new Uint8Array(8) },
      { name: "DEMO.nes", bytes: b64ToBytes(DEMO_ROM_B64) }
    ];
    assert.equal(GrokRom.zipIsPs1DiscSet(files), false);
  });

  it("collapses loose track dumps when a .cue is present", () => {
    const roms = [
      { name: "game.cue", kind: "ps1", bytes: new Uint8Array(4) },
      { name: "game.bin", kind: "ps1", bytes: new Uint8Array(4) },
      { name: "other.nes", kind: "nes", bytes: new Uint8Array(4) }
    ];
    const out = GrokRom.collapsePs1Tracks(roms);
    assert.equal(out.length, 2);
    assert.equal(out[0].name, "game.cue");
    assert.equal(out[1].name, "other.nes");
  });
});
