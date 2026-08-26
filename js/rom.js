/* ROM sniffing, zip extract, id hash. */
(function (g) {
  "use strict";

  const GB_LOGO = [0xce, 0xed, 0x66, 0x66];

  function extOf(name) {
    const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
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

  function gbLabel(bytes) {
    if (!isGb(bytes)) return "Game Boy";
    const flag = bytes[0x143];
    if (flag === 0xc0) return "Game Boy Color";
    if (flag === 0x80) return "Game Boy Color (compat)";
    return "Game Boy";
  }

  function detect(bytes, name) {
    if (isNes(bytes)) return "nes";
    if (isGb(bytes)) return "gb";
    const ext = extOf(name);
    if (ext === "nes" || ext === "unf" || ext === "unif" || ext === "fds") return "nes";
    if (ext === "gb" || ext === "gbc" || ext === "sgb" || ext === "dmg") return "gb";
    return null;
  }

  function u16(bytes, off) {
    return bytes[off] | (bytes[off + 1] << 8);
  }
  function u32(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
  }

  function findEocd(bytes) {
    const min = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= min; i--) {
      if (u32(bytes, i) === 0x06054b50) return i;
    }
    return -1;
  }

  async function inflateRaw(compressed) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot unzip ROMs");
    }
    const ds = new DecompressionStream("deflate-raw");
    const out = new Blob([compressed]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }

  async function unzipEntries(bytes) {
    const eocd = findEocd(bytes);
    if (eocd < 0) throw new Error("Not a zip archive");
    const count = u16(bytes, eocd + 10);
    let off = u32(bytes, eocd + 16);
    const files = [];
    for (let n = 0; n < count; n++) {
      if (u32(bytes, off) !== 0x02014b50) break;
      const method = u16(bytes, off + 10);
      const compSize = u32(bytes, off + 20);
      const nameLen = u16(bytes, off + 28);
      const extraLen = u16(bytes, off + 30);
      const commentLen = u16(bytes, off + 32);
      const localOff = u32(bytes, off + 42);
      const name = new TextDecoder("utf-8").decode(bytes.subarray(off + 46, off + 46 + nameLen));
      off += 46 + nameLen + extraLen + commentLen;
      if (!name || name.endsWith("/")) continue;
      if (u32(bytes, localOff) !== 0x04034b50) continue;
      const locName = u16(bytes, localOff + 26);
      const locExtra = u16(bytes, localOff + 28);
      const dataOff = localOff + 30 + locName + locExtra;
      const payload = bytes.subarray(dataOff, dataOff + compSize);
      let data;
      if (method === 0) data = payload.slice();
      else if (method === 8) data = await inflateRaw(payload);
      else continue;
      files.push({ name: name.split("/").pop(), bytes: data });
    }
    return files;
  }

  function scoreRom(file) {
    const kind = detect(file.bytes, file.name);
    if (kind === "nes") return 3;
    if (kind === "gb") return 2;
    const ext = extOf(file.name);
    if (ext === "nes") return 1;
    if (ext === "gb" || ext === "gbc") return 1;
    return 0;
  }

  async function unwrap(bytes, name) {
    if (!isZip(bytes) && extOf(name) !== "zip") {
      return { bytes: bytes, name: name || "ROM" };
    }
    const files = await unzipEntries(bytes);
    if (!files.length) throw new Error("Zip is empty");
    files.sort(function (a, b) { return scoreRom(b) - scoreRom(a); });
    const best = files[0];
    if (scoreRom(best) === 0) {
      throw new Error("No NES / Game Boy ROM inside that zip");
    }
    return { bytes: best.bytes, name: best.name };
  }

  function romId(bytes) {
    let h = 2166136261;
    const step = Math.max(1, (bytes.length / 4096) | 0);
    for (let i = 0; i < bytes.length; i += step) h = Math.imul(h ^ bytes[i], 16777619);
    h ^= bytes.length;
    return (h >>> 0) || 1;
  }

  g.GrokRom = {
    extOf: extOf,
    isZip: isZip,
    isNes: isNes,
    isGb: isGb,
    gbLabel: gbLabel,
    detect: detect,
    unwrap: unwrap,
    romId: romId
  };
})(typeof window !== "undefined" ? window : globalThis);
