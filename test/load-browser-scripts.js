"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function loadScript(rel) {
  const filename = path.join(ROOT, rel);
  const code = fs.readFileSync(filename, "utf8");
  vm.runInThisContext(code, { filename: rel });
}

function loadNesStack() {
  loadScript("js/demo-rom.js");
  loadScript("js/bin.js");
  loadScript("js/cpu.js");
  loadScript("js/ppu.js");
  loadScript("js/apu.js");
  loadScript("js/mappers.js");
  loadScript("js/nes.js");
  loadScript("js/rom.js");
}

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

module.exports = { loadScript, loadNesStack, b64ToBytes, ROOT };
