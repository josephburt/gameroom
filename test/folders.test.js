"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadScript } = require("./load-browser-scripts");

loadScript("js/folders.js");

describe("GrokFolders PS1 BIOS preference", () => {
  it("prefers scph5501.bin over other SCPH dumps", () => {
    assert.equal(GrokFolders._biosPrefer("ps1", "scph5501.bin", "scph7001.bin"), true);
    assert.equal(GrokFolders._biosPrefer("ps1", "scph7001.bin", "scph5501.bin"), false);
  });

  it("picks the preferred entry from a mixed list", () => {
    const all = [
      { kind: "ps1", key: "scph5502.bin", name: "scph5502.bin" },
      { kind: "gba", key: "gba_bios.bin", name: "gba_bios.bin" },
      { kind: "ps1", key: "scph5501.bin", name: "scph5501.bin" },
      { kind: "ps1", key: "scph1000.bin", name: "scph1000.bin" }
    ];
    const preferred = GrokFolders._preferredFromAll(all);
    assert.equal(preferred.ps1.key, "scph5501.bin");
    assert.equal(preferred.gba.key, "gba_bios.bin");
  });

  it("does not swap non-PS1 kinds on later files", () => {
    assert.equal(GrokFolders._biosPrefer("gba", "gba_bios.bin", "gba_bios.bin"), false);
  });
});
