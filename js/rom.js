/* ROM sniffing, zip extract, id hash. */
(function (g) {
  "use strict";

  const GB_LOGO = [0xce, 0xed, 0x66, 0x66];
  const ROM_EXT = {
    nes: 1, unf: 1, unif: 1, fds: 1,
    gb: 1, gbc: 1, sgb: 1, dmg: 1
  };

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

  function skipJunk(bytes) {
    if (bytes.length > 528 && isNes(bytes.subarray(512))) return bytes.subarray(512);
    if (bytes.length > 512 + 0x150 && isGb(bytes.subarray(512))) return bytes.subarray(512);
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
    if (isGb(bytes)) return "gb";
    const ext = extOf(name);
    if (ext === "nes" || ext === "unf" || ext === "unif" || ext === "fds") return "nes";
    if (ext === "gb" || ext === "gbc" || ext === "sgb" || ext === "dmg") return "gb";
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

  g.GrokRom = {
    extOf: extOf,
    baseName: baseName,
    isZip: isZip,
    isNes: isNes,
    isGb: isGb,
    gbLabel: gbLabel,
    detect: detect,
    listRoms: listRoms,
    romId: romId,
    skipJunk: skipJunk
  };
})(typeof window !== "undefined" ? window : globalThis);
