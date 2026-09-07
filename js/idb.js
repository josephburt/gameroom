/* Tiny IndexedDB helper. Database grok-nes. */
(function (g) {
  "use strict";

  const DB_NAME = "grok-nes";
  const DB_VER = 4;
  let dbp = null;

  function addStores(db) {
    if (!db.objectStoreNames.contains("states")) {
      db.createObjectStore("states", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("library")) {
      db.createObjectStore("library", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("handles")) {
      db.createObjectStore("handles", { keyPath: "id" });
    }
  }

  function needsStores(db) {
    return !db.objectStoreNames.contains("library") ||
      !db.objectStoreNames.contains("states") ||
      !db.objectStoreNames.contains("handles");
  }

  function openAt(ver) {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, ver);
      req.onupgradeneeded = function () { addStores(req.result); };
      req.onblocked = function () {
        reject(new Error("Close other GameRoom tabs to update storage"));
      };
      req.onsuccess = function () {
        const db = req.result;
        db.onversionchange = function () { try { db.close(); } catch (e) {} };
        if (needsStores(db)) {
          const next = db.version + 1;
          db.close();
          openAt(next).then(resolve, reject);
          return;
        }
        resolve(db);
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  function open() {
    if (dbp) return dbp;
    dbp = openAt(DB_VER).catch(function (err) {
      dbp = null;
      throw err;
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s);
        t.oncomplete = function () { resolve(req ? req.result : undefined); };
        t.onerror = function () { reject(t.error); };
        if (req) {
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        }
      });
    });
  }

  g.GrokIdb = {
    put: function (store, value) {
      return tx(store, "readwrite", function (s) { return s.put(value); });
    },
    get: function (store, id) {
      return tx(store, "readonly", function (s) { return s.get(id); });
    },
    del: function (store, id) {
      return tx(store, "readwrite", function (s) { return s.delete(id); });
    },
    all: function (store) {
      return tx(store, "readonly", function (s) { return s.getAll(); });
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
