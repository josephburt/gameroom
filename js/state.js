/* Save-state slots in IndexedDB. NES uses our blob; GB/SNES use EmulatorJS. */
(function (g) {
  "use strict";

  const SLOTS = 10; /* 0 = quick / auto */

  function stateId(romId, slot) {
    return String(romId) + ":" + slot;
  }

  function screenshotNes(canvas) {
    try {
      const tmp = document.createElement("canvas");
      tmp.width = 128;
      tmp.height = 120;
      tmp.getContext("2d").drawImage(canvas, 0, 0, 128, 120);
      return tmp.toDataURL("image/jpeg", 0.6);
    } catch (e) {
      return "";
    }
  }

  function screenshotEjs() {
    try {
      const el = document.querySelector("#ejs-player canvas, #ejs-player .ejs_canvas");
      if (!el) return "";
      const tmp = document.createElement("canvas");
      tmp.width = 128;
      tmp.height = 112;
      tmp.getContext("2d").drawImage(el, 0, 0, 128, 112);
      return tmp.toDataURL("image/jpeg", 0.6);
    } catch (e) {
      return "";
    }
  }

  async function capture(opts) {
    const system = opts.system;
    let bytes;
    let shot = "";
    if (system === "nes") {
      bytes = opts.nes.serialize();
      shot = screenshotNes(opts.canvas);
    } else {
      bytes = await g.GrokEjs.getState();
      shot = screenshotEjs();
    }
    const rec = {
      id: stateId(opts.romId, opts.slot),
      romId: opts.romId,
      slot: opts.slot,
      system: system,
      name: opts.name || "ROM",
      ts: Date.now(),
      shot: shot,
      bytes: bytes
    };
    await g.GrokIdb.put("states", rec);
    return rec;
  }

  async function restore(opts) {
    const rec = await g.GrokIdb.get("states", stateId(opts.romId, opts.slot));
    if (!rec || !rec.bytes) throw new Error("Empty slot");
    if (rec.system && rec.system !== opts.system) {
      throw new Error("That slot is for a different system");
    }
    if (opts.system === "nes") opts.nes.deserialize(rec.bytes);
    else await g.GrokEjs.loadState(rec.bytes);
    return rec;
  }

  async function remove(romId, slot) {
    await g.GrokIdb.del("states", stateId(romId, slot));
  }

  async function list(romId) {
    const all = await g.GrokIdb.all("states");
    const bySlot = {};
    (all || []).forEach(function (r) {
      if (r.romId === romId) bySlot[r.slot] = r;
    });
    const out = [];
    for (let i = 0; i < SLOTS; i++) out.push(bySlot[i] || null);
    return out;
  }

  function render(root, slots, handlers) {
    root.innerHTML = "";
    slots.forEach(function (rec, i) {
      const li = document.createElement("li");
      li.className = "state-slot" + (rec ? " filled" : "");
      const label = i === 0 ? "Quick" : "Slot " + i;
      let body = "<div class='state-meta'><strong>" + label + "</strong>";
      if (rec) {
        const d = new Date(rec.ts);
        body += "<span>" + d.toLocaleString() + "</span>";
      } else {
        body += "<span>Empty</span>";
      }
      body += "</div>";
      if (rec && rec.shot) body += "<img alt='' src='" + rec.shot + "' />";
      else body += "<div class='state-ph'></div>";
      const actions = document.createElement("div");
      actions.className = "state-actions";
      const save = document.createElement("button");
      save.type = "button";
      save.className = "btn";
      save.textContent = "Save";
      save.onclick = function () { handlers.save(i); };
      actions.appendChild(save);
      if (rec) {
        const load = document.createElement("button");
        load.type = "button";
        load.className = "btn primary";
        load.textContent = "Load";
        load.onclick = function () { handlers.load(i); };
        actions.appendChild(load);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn";
        del.textContent = "Delete";
        del.onclick = function () { handlers.del(i); };
        actions.appendChild(del);
      }
      li.innerHTML = body;
      li.appendChild(actions);
      root.appendChild(li);
    });
  }

  g.GrokState = {
    SLOTS: SLOTS,
    capture: capture,
    restore: restore,
    remove: remove,
    list: list,
    render: render
  };
})(typeof window !== "undefined" ? window : globalThis);
