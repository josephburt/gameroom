/* Local ROM / BIOS folders via File System Access API. Handles persist in IndexedDB. */
(function (g) {
  "use strict";

  const ROM_KEY = "rom-folder";
  const BIOS_KEY = "bios-folder";
  const STORE = "handles";
  const MAX_DEPTH = 3;
  const MAX_ENTRIES = 800;
  const ROM_EXT = {
    nes: 1, unf: 1, unif: 1, fds: 1,
    gb: 1, gbc: 1, sgb: 1, dmg: 1,
    sfc: 1, smc: 1, fig: 1, swc: 1, gd3: 1, gd7: 1, dx2: 1, bsx: 1,
    gba: 1, agb: 1, mb: 1,
    md: 1, gen: 1, smd: 1,
    zip: 1
  };
  const BIOS_NAMES = {
    "gba_bios.bin": "gba",
    "gb_bios.bin": "gb",
    "gbc_bios.bin": "gbc",
    "sgb_bios.bin": "sgb"
  };

  let romHandle = null;
  let biosHandle = null;
  let biosCache = null;
  let biosObjectUrl = "";

  function supported() {
    return typeof g.showDirectoryPicker === "function" &&
      typeof g.FileSystemDirectoryHandle !== "undefined";
  }

  function extOf(name) {
    if (g.GrokRom && GrokRom.extOf) return GrokRom.extOf(name);
    const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
  }

  function baseName(name) {
    if (g.GrokRom && GrokRom.baseName) return GrokRom.baseName(name);
    const parts = String(name || "").split("/");
    return parts[parts.length - 1] || name || "";
  }

  async function ensurePermission(handle, opts) {
    if (!handle) return false;
    opts = opts || {};
    const perm = { mode: "read" };
    try {
      if (handle.queryPermission) {
        const q = await handle.queryPermission(perm);
        if (q === "granted") return true;
        if (opts.queryOnly) return false;
      } else if (opts.queryOnly) {
        return false;
      }
      if (handle.requestPermission) {
        const r = await handle.requestPermission(perm);
        return r === "granted";
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveHandle(key, handle) {
    return g.GrokIdb.put(STORE, { id: key, handle: handle, name: handle.name || "", ts: Date.now() });
  }

  async function loadHandle(key) {
    const row = await g.GrokIdb.get(STORE, key);
    return row && row.handle ? row : null;
  }

  async function clearHandle(key) {
    await g.GrokIdb.del(STORE, key);
  }

  async function pickDirectory() {
    return g.showDirectoryPicker({
      id: "burtlabs-gameroom",
      mode: "read",
      startIn: "documents"
    });
  }

  async function walkRoms(dir, prefix, depth, out) {
    if (!dir || depth > MAX_DEPTH || out.length >= MAX_ENTRIES) return;
    const iter = dir.values ? dir.values() : dir.entries();
    for await (const item of iter) {
      if (out.length >= MAX_ENTRIES) break;
      let handle = item;
      let name = item.name;
      if (Array.isArray(item)) {
        name = item[0];
        handle = item[1];
      }
      if (!handle || !name || name.startsWith(".")) continue;
      const path = prefix ? prefix + "/" + name : name;
      if (handle.kind === "directory") {
        await walkRoms(handle, path, depth + 1, out);
        continue;
      }
      if (handle.kind !== "file") continue;
      const ext = extOf(name);
      if (!ROM_EXT[ext]) continue;
      out.push({
        name: name,
        path: path,
        ext: ext,
        handle: handle
      });
    }
  }

  async function scanRoms(handle) {
    const out = [];
    if (!handle) return out;
    await walkRoms(handle, "", 0, out);
    out.sort(function (a, b) {
      return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
    });
    return out;
  }

  async function walkBios(dir, depth, map) {
    if (!dir || depth > 2) return;
    const iter = dir.values ? dir.values() : dir.entries();
    for await (const item of iter) {
      let handle = item;
      let name = item.name;
      if (Array.isArray(item)) {
        name = item[0];
        handle = item[1];
      }
      if (!handle || !name || name.startsWith(".")) continue;
      if (handle.kind === "directory") {
        await walkBios(handle, depth + 1, map);
        continue;
      }
      if (handle.kind !== "file") continue;
      const key = String(name).toLowerCase();
      if (BIOS_NAMES[key] && !map[BIOS_NAMES[key]]) {
        map[BIOS_NAMES[key]] = { name: name, handle: handle, key: key };
      }
    }
  }

  async function scanBios(handle) {
    const map = {};
    if (!handle) return map;
    await walkBios(handle, 0, map);
    return map;
  }

  function revokeBiosUrl() {
    if (biosObjectUrl) {
      try { URL.revokeObjectURL(biosObjectUrl); } catch (e) {}
      biosObjectUrl = "";
    }
  }

  async function pickRomFolder() {
    if (!supported()) throw new Error("Folder pickers need Chrome, Edge, or another Chromium browser.");
    const handle = await pickDirectory();
    await saveHandle(ROM_KEY, handle);
    romHandle = handle;
    return handle;
  }

  async function pickBiosFolder() {
    if (!supported()) throw new Error("Folder pickers need Chrome, Edge, or another Chromium browser.");
    const handle = await pickDirectory();
    await saveHandle(BIOS_KEY, handle);
    biosHandle = handle;
    biosCache = null;
    revokeBiosUrl();
    return handle;
  }

  async function restoreRomFolder() {
    if (!supported()) return null;
    const row = await loadHandle(ROM_KEY);
    if (!row || !row.handle) {
      romHandle = null;
      return null;
    }
    /* Keep the handle even if permission is not granted yet — requestPermission needs a user gesture. */
    romHandle = row.handle;
    const ok = await ensurePermission(row.handle, { queryOnly: true });
    return {
      handle: romHandle,
      name: romHandle.name || row.name || "",
      needsPermission: !ok
    };
  }

  async function restoreBiosFolder() {
    if (!supported()) return null;
    const row = await loadHandle(BIOS_KEY);
    if (!row || !row.handle) {
      biosHandle = null;
      biosCache = null;
      return null;
    }
    biosHandle = row.handle;
    biosCache = null;
    const ok = await ensurePermission(row.handle, { queryOnly: true });
    return {
      handle: biosHandle,
      name: biosHandle.name || row.name || "",
      needsPermission: !ok
    };
  }

  async function clearRomFolder() {
    romHandle = null;
    await clearHandle(ROM_KEY);
  }

  async function clearBiosFolder() {
    biosHandle = null;
    biosCache = null;
    revokeBiosUrl();
    await clearHandle(BIOS_KEY);
  }

  function getRomHandle() { return romHandle; }
  function getBiosHandle() { return biosHandle; }

  async function listRomLibrary() {
    if (!romHandle) return [];
    if (!(await ensurePermission(romHandle))) {
      throw new Error("Permission to the ROM folder was denied. Pick the folder again.");
    }
    return scanRoms(romHandle);
  }

  async function readEntry(entry) {
    if (!entry || !entry.handle) throw new Error("Missing file handle");
    const file = await entry.handle.getFile();
    const buf = await file.arrayBuffer();
    return { bytes: new Uint8Array(buf), name: entry.name || file.name };
  }

  async function biosMap() {
    if (!biosHandle) return {};
    if (!(await ensurePermission(biosHandle))) return {};
    if (!biosCache) biosCache = await scanBios(biosHandle);
    return biosCache;
  }

  async function listBiosFiles() {
    const map = await biosMap();
    return Object.keys(map).map(function (k) {
      return { kind: k, name: map[k].name };
    });
  }

  /* Prefer GBA BIOS for gba; GB/GBC BIOS for those cores. Optional — empty string if missing. */
  async function biosUrlFor(kind) {
    revokeBiosUrl();
    const map = await biosMap();
    let entry = null;
    if (kind === "gba") entry = map.gba;
    else if (kind === "gbc") entry = map.gbc || map.gb;
    else if (kind === "gb") entry = map.gb || map.gbc;
    if (!entry || !entry.handle) return "";
    const file = await entry.handle.getFile();
    biosObjectUrl = URL.createObjectURL(file);
    return biosObjectUrl;
  }

  g.GrokFolders = {
    supported: supported,
    pickRomFolder: pickRomFolder,
    pickBiosFolder: pickBiosFolder,
    restoreRomFolder: restoreRomFolder,
    restoreBiosFolder: restoreBiosFolder,
    clearRomFolder: clearRomFolder,
    clearBiosFolder: clearBiosFolder,
    getRomHandle: getRomHandle,
    getBiosHandle: getBiosHandle,
    listRomLibrary: listRomLibrary,
    readEntry: readEntry,
    listBiosFiles: listBiosFiles,
    biosUrlFor: biosUrlFor,
    revokeBiosUrl: revokeBiosUrl,
    ensurePermission: ensurePermission
  };
})(typeof window !== "undefined" ? window : globalThis);
