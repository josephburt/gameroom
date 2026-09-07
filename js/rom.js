/* ROM sniffing, zip extract, id hash. */
(function (g) {
  "use strict";

  const GB_LOGO = [0xce, 0xed, 0x66, 0x66];
  const ROM_EXT = {
    nes: 1, unf: 1, unif: 1, fds: 1,
    gb: 1, gbc: 1, sgb: 1, dmg: 1,
    sfc: 1, smc: 1, fig: 1, swc: 1, gd3: 1, gd7: 1, dx2: 1, bsx: 1
  };
  const SNES_EXT = { sfc: 1, smc: 1, fig: 1, swc: 1, gd3: 1, gd7: 1, dx2: 1, bsx: 1 };

  function extOf(name) {
    const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
  }

  function baseName(name) {
    const parts = String(name || "").split("/");
    return parts[parts.length - 1] || name || "ROM";
  }

  function isZip(bytes) {
    return bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  }

  function isNes(bytes) {
    return bytes && bytes.length >= 16 &&
      bytes[0] === 0x4e && bytes[1] === 0x45 && bytes[2] === 0x53 && bytes[3] === 0x1a;
  }

  function isGb(bytes) {
    if (!bytes || bytes.length < 0x150) return false;
    for (let i = 0; i < GB_LOGO.length; i++) {
      if (bytes[0x104 + i] !== GB_LOGO[i]) return false;
    }
    return true;
  }

  function snesScore(bytes, offset) {
    if (bytes.length < offset + 0x50) return 0;
    let score = 0;
    const cs = bytes[offset + 0x1c] | (bytes[offset + 0x1d] << 8);
    const csc = bytes[offset + 0x1e] | (bytes[offset + 0x1f] << 8);
    if (((cs + csc) & 0xffff) === 0xffff) score += 8;
    const map = bytes[offset + 0x15];
    if (map === 0x20 || map === 0x21 || map === 0x30 || map === 0x31) score += 4;
    let ascii = 0;
    for (let i = 0; i < 21; i++) {
      const c = bytes[offset + i];
      if (c >= 0x20 && c <= 0x7e) ascii++;
    }
    if (ascii >= 18) score += 3;
    const reset = bytes[offset + 0x3c] | (bytes[offset + 0x3d] << 8);
    if (reset >= 0x8000) score += 2;
    return score;
  }

  function isSnes(bytes) {
    if (!bytes || bytes.length < 0x8000) return false;
    const body = (bytes.length % 1024 === 512) ? bytes.subarray(512) : bytes;
    const lo = snesScore(body, 0x7fc0);
    const hi = snesScore(body, 0xffc0);
    return Math.max(lo, hi) >= 8;
  }

  function skipJunk(bytes) {
    if (bytes.length > 528 && isNes(bytes.subarray(512))) return bytes.subarray(512);
    if (bytes.length > 512 + 0x150 && isGb(bytes.subarray(512))) return bytes.subarray(512);
    if (bytes.length % 1024 === 512 && isSnes(bytes.subarray(512))) return bytes.subarray(512);
    return bytes;
  }

  function gbLabel(bytes) {
    bytes = skipJunk(bytes);
    if (!isGb(bytes)) return "Game Boy";
    const flag = bytes[0x143];
    if (flag === 0xc0) return "Game Boy Color";
    if (flag === 0x80) return "Game Boy Color (compat)";
    return "Game Boy";
  }

  function detect(bytes, name) {
    bytes = skipJunk(bytes);
    if (isNes(bytes)) return "nes";
    if (isGb(bytes)) return bytes[0x143] === 0xc0 || bytes[0x143] === 0x80 ? "gbc" : "gb";
    if (isSnes(bytes)) return "snes";
    const ext = extOf(name);
    if (ext === "nes" || ext === "unf" || ext === "unif" || ext === "fds") return "nes";
    if (ext === "gbc") return "gbc";
    if (ext === "gb" || ext === "sgb" || ext === "dmg") return "gb";
    if (SNES_EXT[ext]) return "snes";
    return null;
  }

  function skipJunkFile(file) {
    const bytes = skipJunk(file.bytes);
    if (bytes === file.bytes) return file;
    return { name: file.name, path: file.path, bytes: bytes };
  }

  async function unzipEntries(bytes) {
    if (typeof JSZip === "undefined") throw new Error("Zip support failed to load");
    const zip = await JSZip.loadAsync(bytes);
    const files = [];
    const names = Object.keys(zip.files);
    for (let i = 0; i < names.length; i++) {
      const path = names[i];
      const entry = zip.files[path];
      if (!entry || entry.dir) continue;
      const name = baseName(path);
      if (!name || name.startsWith(".") || path.indexOf("__MACOSX") !== -1) continue;
      const buf = await entry.async("uint8array");
      files.push({ name: name, path: path, bytes: buf });
    }
    return files;
  }

  async function listRoms(bytes, name) {
    const out = [];

    async function consider(file) {
      file = skipJunkFile(file);
      if (isZip(file.bytes) || extOf(file.name) === "zip") {
        try {
          const inner = await unzipEntries(file.bytes);
          for (let i = 0; i < inner.length; i++) await consider(inner[i]);
        } catch (e) {}
        return;
      }
      const kind = detect(file.bytes, file.name);
      if (kind) out.push({ name: file.name, path: file.path || file.name, bytes: file.bytes, kind: kind });
    }

    if (isZip(bytes) || extOf(name) === "zip") {
      const files = await unzipEntries(bytes);
      for (let i = 0; i < files.length; i++) await consider(files[i]);
    } else {
      await consider({ name: name || "ROM", bytes: bytes });
    }
    return out;
  }

  function romId(bytes) {
    let h = 2166136261;
    const step = Math.max(1, (bytes.length / 4096) | 0);
    for (let i = 0; i < bytes.length; i += step) h = Math.imul(h ^ bytes[i], 16777619);
    h ^= bytes.length;
    return (h >>> 0) || 1;
  }

  function systemLabel(kind, bytes) {
    if (kind === "nes") return "NES";
    if (kind === "snes") return "Super NES";
    if (kind === "gb" || kind === "gbc") return gbLabel(bytes);
    return kind || "ROM";
  }

  function asciiTitle(bytes, off, len) {
    let s = "";
    for (let i = 0; i < len && off + i < bytes.length; i++) {
      const c = bytes[off + i];
      if (c === 0) break;
      if (c < 0x20 || c > 0x7e) {
        if (s.length) break;
        continue;
      }
      s += String.fromCharCode(c);
    }
    return s.replace(/\s+/g, " ").trim();
  }

  function prettyName(kind, bytes, fileName) {
    bytes = skipJunk(bytes || new Uint8Array());
    if (kind === "snes" || isSnes(bytes)) {
      const body = (bytes.length % 1024 === 512) ? bytes.subarray(512) : bytes;
      const lo = snesScore(body, 0x7fc0);
      const hi = snesScore(body, 0xffc0);
      const t = asciiTitle(body, hi > lo ? 0xffc0 : 0x7fc0, 21);
      if (t.length >= 3) return t;
    }
    if (kind === "gb" || kind === "gbc" || isGb(bytes)) {
      const t = asciiTitle(bytes, 0x134, 16);
      if (t.length >= 2) return t;
    }
    return String(fileName || "ROM")
      .replace(/\.[^.]+$/, "")
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/[_]+/g, " ")
      .trim() || "ROM";
  }

  g.GrokRom = {
    extOf: extOf,
    baseName: baseName,
    isZip: isZip,
    isNes: isNes,
    isGb: isGb,
    isSnes: isSnes,
    gbLabel: gbLabel,
    systemLabel: systemLabel,
    prettyName: prettyName,
    detect: detect,
    listRoms: listRoms,
    romId: romId,
    skipJunk: skipJunk
  };
})(typeof window !== "undefined" ? window : globalThis);
