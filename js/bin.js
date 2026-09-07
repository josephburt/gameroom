/* Little-endian binary writer/reader for NES savestates. */
(function (g) {
  "use strict";

  function Writer(cap) {
    this.b = new Uint8Array(cap || 32768);
    this.i = 0;
  }
  Writer.prototype._need = function (n) {
    if (this.i + n <= this.b.length) return;
    const next = new Uint8Array(Math.max(this.b.length * 2, this.i + n));
    next.set(this.b);
    this.b = next;
  };
  Writer.prototype.u8 = function (v) {
    this._need(1);
    this.b[this.i++] = v & 0xff;
  };
  Writer.prototype.u16 = function (v) {
    this.u8(v);
    this.u8(v >> 8);
  };
  Writer.prototype.u32 = function (v) {
    this.u16(v);
    this.u16(v >> 16);
  };
  Writer.prototype.i16 = function (v) {
    this.u16(v < 0 ? (v + 0x10000) : v);
  };
  Writer.prototype.bytes = function (arr) {
    this._need(arr.length);
    this.b.set(arr, this.i);
    this.i += arr.length;
  };
  Writer.prototype.str = function (s) {
    const n = Math.min(s.length, 255);
    this.u8(n);
    for (let i = 0; i < n; i++) this.u8(s.charCodeAt(i) & 0xff);
  };
  Writer.prototype.done = function () {
    return this.b.slice(0, this.i);
  };

  function Reader(buf) {
    this.b = buf;
    this.i = 0;
  }
  Reader.prototype.u8 = function () {
    if (this.i >= this.b.length) throw new Error("Save state truncated");
    return this.b[this.i++];
  };
  Reader.prototype.u16 = function () {
    return this.u8() | (this.u8() << 8);
  };
  Reader.prototype.u32 = function () {
    return this.u16() | (this.u16() << 16);
  };
  Reader.prototype.i16 = function () {
    const v = this.u16();
    return v & 0x8000 ? v - 0x10000 : v;
  };
  Reader.prototype.bytes = function (n) {
    if (this.i + n > this.b.length) throw new Error("Save state truncated");
    const out = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  };
  Reader.prototype.fill = function (arr) {
    const src = this.bytes(arr.length);
    arr.set(src);
  };
  Reader.prototype.str = function () {
    const n = this.u8();
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  };

  g.NesWriter = Writer;
  g.NesReader = Reader;
})(typeof window !== "undefined" ? window : globalThis);
