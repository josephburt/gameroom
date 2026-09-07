/* Delay-based NES lockstep over PeerJS. ROM bytes are never sent. */
(function (g) {
  "use strict";

  const DELAY = 3;
  const STUN = [{ urls: "stun:stun.l.google.com:19302" }];

  let peer = null;
  let conn = null;
  let host = false;
  let ready = false;
  let frame = 0;
  let localId = 0;
  let remoteId = 1;
  let pending = {};
  let localQueue = [];
  let statusFn = function () {};
  let romId = 0;
  let stalling = false;

  function setStatus(s) { statusFn(s); }

  function code() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    const a = new Uint8Array(6);
    crypto.getRandomValues(a);
    for (let i = 0; i < 6; i++) s += alphabet[a[i] % alphabet.length];
    return s;
  }

  function ensurePeer(id) {
    if (typeof g.Peer !== "function") {
      return Promise.reject(new Error("Netplay library failed to load"));
    }
    return new Promise(function (resolve, reject) {
      const p = new g.Peer(id, { debug: 0, config: { iceServers: STUN } });
      const t = setTimeout(function () {
        try { p.destroy(); } catch (e) {}
        reject(new Error("Could not reach the signaling server"));
      }, 12000);
      p.on("open", function () {
        clearTimeout(t);
        peer = p;
        resolve(p);
      });
      p.on("error", function (err) {
        clearTimeout(t);
        reject(err);
      });
    });
  }

  function wire(c, isHost, opts) {
    conn = c;
    host = isHost;
    localId = isHost ? 0 : 1;
    remoteId = isHost ? 1 : 0;
    romId = opts.romId;
    frame = 0;
    pending = {};
    localQueue = [];
    for (let i = 0; i < DELAY; i++) pending[i] = [0, 0];
    ready = false;
    stalling = false;

    function greet() {
      try { c.send({ t: "hello", romId: romId, delay: DELAY }); } catch (e) {}
      setStatus("Exchanging handshake…");
    }

    c.on("data", function (msg) {
      if (!msg || typeof msg !== "object") return;
      if (msg.t === "hello") {
        if (msg.romId !== romId) {
          setStatus("ROM mismatch — both of you need the same file");
          close();
          return;
        }
        ready = true;
        setStatus("Connected — you are player " + (localId + 1));
        try { c.send({ t: "hello-ok", romId: romId }); } catch (e) {}
      } else if (msg.t === "hello-ok") {
        ready = true;
        setStatus("Connected — you are player " + (localId + 1));
      } else if (msg.t === "input") {
        if (!pending[msg.f]) pending[msg.f] = [null, null];
        pending[msg.f][remoteId] = msg.b;
      }
    });
    c.on("close", function () {
      ready = false;
      setStatus("Peer disconnected");
    });
    c.on("open", greet);
    if (c.open) greet();
  }

  async function create(opts) {
    close();
    statusFn = opts.onStatus || statusFn;
    const id = "gnes-" + code();
    setStatus("Creating room…");
    await ensurePeer(id);
    const room = id.replace(/^gnes-/, "");
    peer.on("connection", function (c) {
      wire(c, true, opts);
      setStatus("Guest found — connecting…");
    });
    setStatus("Room " + room + " — waiting for a guest");
    return room;
  }

  async function join(room, opts) {
    close();
    statusFn = opts.onStatus || statusFn;
    const hostId = "gnes-" + String(room || "").trim().toUpperCase();
    setStatus("Joining " + hostId.replace(/^gnes-/, "") + "…");
    await ensurePeer();
    const c = peer.connect(hostId, { reliable: true });
    wire(c, false, opts);
    return hostId;
  }

  function sendLocal(buttons) {
    if (!conn || !ready) return;
    const f = frame + DELAY;
    if (!pending[f]) pending[f] = [null, null];
    pending[f][localId] = buttons;
    conn.send({ t: "input", f: f, b: buttons });
  }

  function consume(localButtons) {
    if (!ready) {
      return { active: false, p1: localButtons, p2: 0, stall: false };
    }
    sendLocal(localButtons);
    const slot = pending[frame];
    if (!slot || slot[0] === null || slot[1] === null) {
      stalling = true;
      return { active: true, stall: true, p1: 0, p2: 0 };
    }
    stalling = false;
    const out = { active: true, stall: false, p1: slot[0], p2: slot[1] };
    delete pending[frame];
    frame++;
    return out;
  }

  function close() {
    ready = false;
    try { if (conn) conn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conn = null;
    peer = null;
    pending = {};
  }

  g.GrokNetplay = {
    DELAY: DELAY,
    create: create,
    join: join,
    consume: consume,
    close: close,
    isActive: function () { return ready; },
    isStalling: function () { return stalling; }
  };
})(typeof window !== "undefined" ? window : globalThis);
