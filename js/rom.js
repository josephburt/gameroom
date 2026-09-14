/* ROM sniffing, zip extract, id hash. */
(function (g) {
  "use strict";

  const GB_LOGO = [0xce, 0xed, 0x66, 0x66];
  const ROM_EXT = {
    nes: 1, unf: 1, unif: 1, fds: 1,
    gb: 1, gbc: 1, sgb: 1, dmg: 1,
    sfc: 1, smc: 1, fig: 1, swc: 1, gd3: 1, gd7: 1, dx2: 1, bsx: 1,
    gba: 1, agb: 1, mb: 1,
    md: 1, gen: 1, smd: 1, bin: 1,
    cue: 1, pbp: 1, ccd: 1, m3u: 1, toc: 1, cbn: 1, img: 1, mdf: 1, iso: 1,
    n64: 1, z64: 1, v64: 1,
    nds: 1,
    chd: 1
  };
  const SNES_EXT = { sfc: 1, smc: 1, fig: 1, swc: 1, gd3: 1, gd7: 1, dx2: 1, bsx: 1 };
  const GBA_EXT = { gba: 1, agb: 1, mb: 1 };
  const GEN_EXT = { md: 1, gen: 1, smd: 1 };
  const N64_EXT = { n64: 1, z64: 1, v64: 1 };
  /* Clear PS1 containers / dumps. .bin alone is ambiguous with Genesis — only via prefer. */
  const PS1_EXT = { cue: 1, pbp: 1, ccd: 1, m3u: 1, toc: 1, cbn: 1, img: 1, mdf: 1, iso: 1 };
  const SATURN_EXT = { cue: 1, iso: 1, mds: 1, ccd: 1, chd: 1 };

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

  /* GBA: fixed 0x96 at 0xB2; optional Nintendo logo fingerprint at 0x04. */
  function isGba(bytes) {
    if (!bytes || bytes.length < 0xc0) return false;
    if (bytes[0xb2] !== 0x96) return false;
    /* Logo starts 0x04; first bytes commonly 0x24 0xff 0xae 0x51 */
    if (bytes[0x04] === 0x24 && bytes[0x05] === 0xff && bytes[0x06] === 0xae) return true;
    /* Still accept if fixed byte + ASCII game code region looks sane */
    let ascii = 0;
    for (let i = 0xa0; i < 0xac; i++) {
      const c = bytes[i];
      if (c >= 0x20 && c <= 0x7e) ascii++;
    }
    return ascii >= 4;
  }

  function asciiAt(bytes, off, len) {
    let s = "";
    for (let i = 0; i < len && off + i < bytes.length; i++) {
      const c = bytes[off + i];
      if (c < 0x20 || c > 0x7e) return s;
      s += String.fromCharCode(c);
    }
    return s;
  }

  /* Genesis / Mega Drive: "SEGA" at 0x100 (binary) or SMD interleaved header. */
  function isGenesis(bytes) {
    if (!bytes || bytes.length < 0x200) return false;
    if (asciiAt(bytes, 0x100, 4) === "SEGA") return true;
    if (asciiAt(bytes, 0x100, 15).indexOf("SEGA") !== -1) return true;
    /* Some dumps put TMSS string nearby */
    if (bytes.length >= 0x110 && asciiAt(bytes, 0x100, 16).indexOf("MEGA DRIVE") !== -1) return true;
    if (bytes.length >= 0x110 && asciiAt(bytes, 0x100, 16).indexOf("GENESIS") !== -1) return true;
    return false;
  }

  /* Sony PBP (PS1/PSP container) magic at offset 0. */
  function isPbp(bytes) {
    return bytes && bytes.length >= 4 &&
      bytes[0] === 0x00 && bytes[1] === 0x50 && bytes[2] === 0x42 && bytes[3] === 0x50;
  }

  function isN64(bytes) {
    if (!bytes || bytes.length < 0x40) return false;
    const b0 = bytes[0];
    const b1 = bytes[1];
    const b2 = bytes[2];
    const b3 = bytes[3];
    /* .z64 big-endian, .n64 little, .v64 byte-swapped */
    return (b0 === 0x80 && b1 === 0x37 && b2 === 0x12 && b3 === 0x40) ||
      (b0 === 0x37 && b1 === 0x80 && b2 === 0x40 && b3 === 0x12) ||
      (b0 === 0x40 && b1 === 0x12 && b2 === 0x37 && b3 === 0x80);
  }

  function isNds(bytes) {
    if (!bytes || bytes.length < 0x200) return false;
    /* Nintendo logo CRC check bytes commonly present in retail dumps */
    return bytes[0x15c] === 0x56 && bytes[0x15d] === 0xcf && bytes[0x15e] === 0xa3 && bytes[0x15f] === 0x3e;
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

  function detect(bytes, name, prefer) {
    bytes = skipJunk(bytes);
    if (isNes(bytes)) return "nes";
    if (isGba(bytes)) return "gba";
    if (isGb(bytes)) return bytes[0x143] === 0xc0 || bytes[0x143] === 0x80 ? "gbc" : "gb";
    if (isSnes(bytes)) return "snes";
    if (isPbp(bytes)) return "ps1";
    if (isN64(bytes)) return "n64";
    if (isNds(bytes)) return "nds";
    if (isGenesis(bytes)) return "genesis";
    const ext = extOf(name);
    if (ext === "nes" || ext === "unf" || ext === "unif" || ext === "fds") return "nes";
    if (ext === "gbc") return "gbc";
    if (ext === "gb" || ext === "sgb" || ext === "dmg") return "gb";
    if (GBA_EXT[ext]) return "gba";
    if (SNES_EXT[ext]) return "snes";
    if (GEN_EXT[ext]) return "genesis";
    if (N64_EXT[ext]) return "n64";
    if (ext === "nds") return "nds";
    if (ext === "chd") {
      if (prefer === "saturn") return "saturn";
      if (prefer === "ps1") return "ps1";
      return "ps1";
    }
    if (prefer === "saturn" && (SATURN_EXT[ext] || ext === "bin")) return "saturn";
    if (PS1_EXT[ext]) return "ps1";
    /* .bin is ambiguous (Genesis vs PS1 track). Only claim PS1 when preferred. */
    if (ext === "bin" && prefer === "ps1") return "ps1";
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

  function zipIsPs1DiscSet(files) {
    let cues = 0;
    let tracks = 0;
    let foreign = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const e = extOf(f.name);
      if (e === "cue") {
        cues++;
        continue;
      }
      if (e === "bin" || e === "img" || e === "iso" || e === "mdf" || e === "toc" || e === "ccd" || e === "sub") {
        tracks++;
        continue;
      }
      if (e === "pbp") {
        foreign++;
        continue;
      }
      const kind = detect(f.bytes, f.name, "");
      if (kind) foreign++;
    }
    return cues >= 1 && tracks >= 1 && foreign === 0;
  }

  /* Drop loose PS1 track dumps when a .cue is also listed (same zip / batch). */
  function collapsePs1Tracks(roms) {
    const hasCue = roms.some(function (r) {
      return r.kind === "ps1" && extOf(r.name) === "cue";
    });
    if (!hasCue) return roms;
    return roms.filter(function (r) {
      if (r.kind !== "ps1") return true;
      const e = extOf(r.name);
      return e !== "bin" && e !== "img" && e !== "iso" && e !== "mdf";
    });
  }

  async function listRoms(bytes, name, opts) {
    opts = opts || {};
    const prefer = opts.prefer || "";
    const out = [];

    async function consider(file) {
      file = skipJunkFile(file);
      if (isZip(file.bytes) || extOf(file.name) === "zip") {
        try {
          const inner = await unzipEntries(file.bytes);
          if (zipIsPs1DiscSet(inner)) {
            out.push({
              name: file.name || "game.zip",
              path: file.path || file.name || "game.zip",
              bytes: file.bytes,
              kind: "ps1"
            });
            return;
          }
          for (let i = 0; i < inner.length; i++) await consider(inner[i]);
        } catch (e) {}
        return;
      }
      const kind = detect(file.bytes, file.name, prefer);
      if (kind) out.push({ name: file.name, path: file.path || file.name, bytes: file.bytes, kind: kind });
    }

    if (isZip(bytes) || extOf(name) === "zip") {
      const files = await unzipEntries(bytes);
      if (zipIsPs1DiscSet(files)) {
        return [{ name: name || "game.zip", path: name || "game.zip", bytes: bytes, kind: "ps1" }];
      }
      for (let i = 0; i < files.length; i++) await consider(files[i]);
    } else {
      await consider({ name: name || "ROM", bytes: bytes });
    }
    return collapsePs1Tracks(out);
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
    if (kind === "gba") return "Game Boy Advance";
    if (kind === "genesis") return "Sega Genesis";
    if (kind === "ps1") return "PlayStation";
    if (kind === "n64") return "Nintendo 64";
    if (kind === "saturn") return "Sega Saturn";
    if (kind === "nds") return "Nintendo DS";
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
    if (kind === "gba" || isGba(bytes)) {
      const t = asciiTitle(bytes, 0xa0, 12);
      if (t.length >= 2) return t;
    }
    if (kind === "genesis" || isGenesis(bytes)) {
      const t = asciiTitle(bytes, 0x150, 48);
      if (t.length >= 3) return t;
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
    isGba: isGba,
    isGenesis: isGenesis,
    isPbp: isPbp,
    isN64: isN64,
    isNds: isNds,
    gbLabel: gbLabel,
    systemLabel: systemLabel,
    prettyName: prettyName,
    detect: detect,
    listRoms: listRoms,
    romId: romId,
    skipJunk: skipJunk,
    zipIsPs1DiscSet: zipIsPs1DiscSet,
    collapsePs1Tracks: collapsePs1Tracks
  };
})(typeof window !== "undefined" ? window : globalThis);
