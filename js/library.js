/* Recently played ROMs, stored in this browser. */
(function (g) {
  "use strict";

  const MAX = 12;
  const SKIP = { "DEMO ROM": 1, "demo.nes": 1 };

  function skipName(name) {
    const n = String(name || "");
    return SKIP[n] || /^DEMO/i.test(n);
  }

  async function remember(rec) {
    if (!rec || !rec.id || !rec.bytes || skipName(rec.name)) return;
    const row = {
      id: rec.id,
      name: rec.name,
      title: rec.title || rec.name,
      kind: rec.kind,
      bytes: rec.bytes,
      shot: rec.shot || "",
      size: rec.bytes.length,
      ts: Date.now()
    };
    const prev = await g.GrokIdb.get("library", rec.id);
    if (prev && prev.shot && !row.shot) row.shot = prev.shot;
    await g.GrokIdb.put("library", row);
    const all = await list();
    if (all.length <= MAX) return;
    const extra = all.slice(MAX);
    for (let i = 0; i < extra.length; i++) {
      await g.GrokIdb.del("library", extra[i].id);
    }
  }

  async function touchShot(id, shot) {
    const prev = await g.GrokIdb.get("library", id);
    if (!prev) return;
    prev.shot = shot;
    prev.ts = Date.now();
    await g.GrokIdb.put("library", prev);
  }

  async function list() {
    const all = (await g.GrokIdb.all("library")) || [];
    all.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return all;
  }

  function remove(id) {
    return g.GrokIdb.del("library", id);
  }

  function get(id) {
    return g.GrokIdb.get("library", id);
  }

  g.GrokLibrary = {
    remember: remember,
    touchShot: touchShot,
    list: list,
    remove: remove,
    get: get
  };
})(typeof window !== "undefined" ? window : globalThis);
