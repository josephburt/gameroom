"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadNesStack, b64ToBytes } = require("./load-browser-scripts");

loadNesStack();

describe("NES save-state round-trip", () => {
  it("serialize → deserialize restores CPU and RAM", () => {
    const bytes = b64ToBytes(DEMO_ROM_B64);
    const nes = new NES();
    nes.loadRom(bytes, "DEMO.nes");

    for (let i = 0; i < 30; i++) nes.stepFrame();
    const pcBefore = nes.cpu.pc;
    const aBefore = nes.cpu.a;
    nes.ram[0x10] = 0x42;
    nes.ram[0x11] = 0x99;
    const snap = nes.serialize();
    assert.ok(snap instanceof Uint8Array);
    assert.ok(snap.length > 100);

    nes.cpu.pc = (pcBefore + 7) & 0xffff;
    nes.cpu.a = (aBefore + 1) & 0xff;
    nes.ram[0x10] = 0;
    nes.ram[0x11] = 0;

    nes.deserialize(snap);
    assert.equal(nes.cpu.pc, pcBefore);
    assert.equal(nes.cpu.a, aBefore);
    assert.equal(nes.ram[0x10], 0x42);
    assert.equal(nes.ram[0x11], 0x99);
  });

  it("rejects a truncated buffer", () => {
    const bytes = b64ToBytes(DEMO_ROM_B64);
    const nes = new NES();
    nes.loadRom(bytes, "DEMO.nes");
    nes.stepFrame();
    assert.throws(() => nes.deserialize(new Uint8Array([1, 2, 3])), /Not a GameRoom NES save state|Save state/);
  });
});
