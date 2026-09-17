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
    z64: 1, n64: 1, v64: 1,
    zip: 1
  };
  /* Lowercase basename → kind. Multiple PS1 names share kind; preference is in biosUrlFor. */
  const BIOS_NAMES = {
    "gba_bios.bin": "gba",
    "gb_bios.bin": "gb",
    "gbc_bios.bin": "gbc",
    "sgb_bios.bin": "sgb",
    "scph5501.bin": "ps1",
    "scph7001.bin": "ps1",
    "scph101.bin": "ps1",
    "scph1001.bin": "ps1",
    "scph5500.bin": "ps1",
    "scph5502.bin": "ps1",
    "scph7000.bin": "ps1",
    "scph7002.bin": "ps1",
    "scph1000.bin": "ps1",
    "scph1002.bin": "ps1",
    "psxonpsp660.bin": "ps1"
  };
  /* Preferred order when several PS1 BIOS files are present (US first). */
  const PS1_BIOS_PREF = [
    "scph5501.bin",
    "scph7001.bin",
    "scph101.bin",
    "scph1001.bin",
    "scph5500.bin",
    "scph5502.bin",
    "scph7000.bin",
    "scph7002.bin",
    "scph1000.bin",
    "scph1002.bin",
    "psxonpsp660.bin"
  ];

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

  async function walkBios(dir, depth, all) {
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
        await walkBios(handle, depth + 1, all);
        continue;
      }
      if (handle.kind !== "file") continue;
      const key = String(name).toLowerCase();
      const kind = BIOS_NAMES[key];
      if (!kind) continue;
      all.push({ name: name, handle: handle, key: key, kind: kind });
    }
  }

  function biosRank(kind, key) {
    if (kind !== "ps1") return 0;
    const i = PS1_BIOS_PREF.indexOf(key);
    return i === -1 ? 100 : i;
  }

  function biosPrefer(kind, nextKey, prevKey) {
    return biosRank(kind, nextKey) < biosRank(kind, prevKey);
  }

  function preferredFromAll(all) {
    const preferred = {};
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      const prev = preferred[e.kind];
      if (!prev || biosPrefer(e.kind, e.key, prev.key)) preferred[e.kind] = e;
    }
    return preferred;
  }

  async function scanBios(handle) {
    const all = [];
    if (!handle) return { preferred: {}, all: all };
    await walkBios(handle, 0, all);
    all.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return biosRank(a.kind, a.key) - biosRank(b.kind, b.key) || a.name.localeCompare(b.name);
    });
    return { preferred: preferredFromAll(all), all: all };
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

  async function biosCacheFull() {
    if (!biosHandle) return { preferred: {}, all: [] };
    if (!(await ensurePermission(biosHandle))) return { preferred: {}, all: [] };
    if (!biosCache) biosCache = await scanBios(biosHandle);
    return biosCache;
  }

  async function biosMap() {
    return (await biosCacheFull()).preferred;
  }

  async function listBiosFiles() {
    const cache = await biosCacheFull();
    const preferred = cache.preferred;
    return cache.all.map(function (e) {
      const pick = preferred[e.kind];
      return {
        kind: e.kind,
        name: e.name,
        key: e.key,
        preferred: !!(pick && pick.key === e.key)
      };
    });
  }

  function entryForKind(map, kind) {
    if (kind === "gba") return map.gba || null;
    if (kind === "gbc") return map.gbc || map.gb || null;
    if (kind === "gb") return map.gb || map.gbc || null;
    if (kind === "ps1") return map.ps1 || null;
    return map[kind] || null;
  }

  /* Prefer GBA BIOS for gba; GB/GBC for those; PS1 required for EmulatorJS psx. */
  async function biosFor(kind) {
    revokeBiosUrl();
    const map = await biosMap();
    const entry = entryForKind(map, kind);
    if (!entry || !entry.handle) return null;
    const file = await entry.handle.getFile();
    biosObjectUrl = URL.createObjectURL(file);
    return { url: biosObjectUrl, name: entry.name, key: entry.key || "" };
  }

  async function biosUrlFor(kind) {
    const info = await biosFor(kind);
    return info ? info.url : "";
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
    biosFor: biosFor,
    biosUrlFor: biosUrlFor,
    revokeBiosUrl: revokeBiosUrl,
    ensurePermission: ensurePermission,
    /* Test helpers (pure preference ranking). */
    _biosPrefer: biosPrefer,
    _preferredFromAll: preferredFromAll
  };
})(typeof window !== "undefined" ? window : globalThis);
