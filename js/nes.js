/* System bus, controllers, OAM DMA, save RAM. */
(function (g) {
  "use strict";

  function Controller() {
    this.strobe = 0;
    this.index = 0;
    this.buttons = 0; // A B Select Start Up Down Left Right
  }
  Controller.prototype.setButton = function (i, down) {
    if (down) this.buttons |= (1 << i);
    else this.buttons &= ~(1 << i);
  };
  Controller.prototype.write = function (v) {
    this.strobe = v & 1;
    if (this.strobe) this.index = 0;
  };
  Controller.prototype.read = function () {
    if (this.index > 7) return 1;
    const v = (this.buttons >> this.index) & 1;
    if (!this.strobe) this.index++;
    return v;
  };

  function NES() {
    this.ram = new Uint8Array(0x800);
    this.cpu = new g.NesCPU(this);
    this.ppu = new g.NesPPU(this);
    this.apu = new g.NesAPU(this);
    this.ctrl1 = new Controller();
    this.ctrl2 = new Controller();
    this.mapper = null;
    this.cart = null;
    this.running = false;
  }

  NES.prototype.cpuRead = function (addr) {
    addr &= 0xffff;
    if (addr < 0x2000) return this.ram[addr & 0x7ff];
    if (addr < 0x4000) return this.ppu.readReg(addr);
    if (addr === 0x4015) return this.apu.read(addr);
    if (addr === 0x4016) return this.ctrl1.read();
    if (addr === 0x4017) return this.ctrl2.read();
    if (addr >= 0x4000 && addr < 0x4018) return 0;
    if (this.mapper) return this.mapper.cpuRead(addr);
    return 0;
  };

  NES.prototype.cpuWrite = function (addr, val) {
    addr &= 0xffff;
    val &= 0xff;
    if (addr < 0x2000) { this.ram[addr & 0x7ff] = val; return; }
    if (addr < 0x4000) { this.ppu.writeReg(addr, val); return; }
    if (addr === 0x4014) {
      const base = val << 8;
      for (let i = 0; i < 256; i++) this.ppu.oam[i] = this.cpuRead(base + i);
      this.cpu.stall += 513;
      return;
    }
    if (addr === 0x4016) {
      this.ctrl1.write(val);
      this.ctrl2.write(val);
      return;
    }
    if (addr >= 0x4000 && addr <= 0x4017) { this.apu.write(addr, val); return; }
    if (this.mapper) this.mapper.cpuWrite(addr, val);
  };

  NES.prototype.loadRom = function (bytes, name) {
    this.cart = new g.NesCart(bytes);
    this.mapper = g.NesCreateMapper(this, this.cart);
    this.name = name || "ROM";
    this.ram.fill(0);
    this.ppu.reset();
    this.apu.reset();
    applySavedRam(this);
    this.cpu.reset();
    return this.cart;
  };

  NES.prototype.reset = function () {
    if (!this.cart) return;
    this.ppu.reset();
    this.apu.reset();
    this.cpu.reset();
  };

  NES.prototype.stepFrame = function () {
    this.ppu.frameReady = false;
    let guard = 0;
    while (!this.ppu.frameReady && guard++ < 40000) {
      const cyc = this.cpu.step();
      this.ppu.step(cyc);
      this.apu.step(cyc);
    }
  };

  const STATE_MAGIC = 0x53454e47; /* GNES le */
  const STATE_VER = 1;

  NES.prototype.serialize = function () {
    if (!this.cart) throw new Error("No ROM loaded");
    const w = new g.NesWriter(24576);
    w.u32(STATE_MAGIC);
    w.u8(STATE_VER);
    w.u8(this.cart.mapperId);
    w.u32(this.cart.prg.length);
    w.u32(this.cart.chr.length);
    w.u8(this.cart.chrRam ? 1 : 0);
    this.cpu.serialize(w);
    w.bytes(this.ram);
    this.ppu.serialize(w);
    this.apu.serialize(w);
    w.bytes(this.cart.prgRam);
    if (this.cart.chrRam) w.bytes(this.cart.chr);
    if (this.mapper && this.mapper.serialize) this.mapper.serialize(w);
    else w.u8(0);
    w.u8(this.ctrl1.buttons);
    w.u8(this.ctrl2.buttons);
    return w.done();
  };

  NES.prototype.deserialize = function (bytes) {
    if (!this.cart) throw new Error("No ROM loaded");
    const r = new g.NesReader(bytes);
    if (r.u32() !== STATE_MAGIC) throw new Error("Not a GameRoom NES save state");
    const ver = r.u8();
    if (ver !== STATE_VER) throw new Error("Save state version " + ver + " is not supported");
    const mapperId = r.u8();
    const prgLen = r.u32();
    const chrLen = r.u32();
    const chrRam = !!r.u8();
    if (mapperId !== this.cart.mapperId || prgLen !== this.cart.prg.length || chrLen !== this.cart.chr.length) {
      throw new Error("Save state is for a different ROM");
    }
    this.cpu.deserialize(r);
    r.fill(this.ram);
    this.ppu.deserialize(r);
    this.apu.deserialize(r);
    r.fill(this.cart.prgRam);
    if (chrRam) r.fill(this.cart.chr);
    if (this.mapper && this.mapper.deserialize) this.mapper.deserialize(r);
    else r.u8();
    this.ctrl1.buttons = r.u8();
    this.ctrl2.buttons = r.u8();
  };

  function applySavedRam(nes) {
    if (!nes.cart || !nes.cart.battery) return;
    try {
      const key = "nes-prgram:" + hashRom(nes.cart);
      const b64 = localStorage.getItem(key);
      if (!b64) return;
      const raw = atob(b64);
      for (let i = 0; i < Math.min(raw.length, nes.cart.prgRam.length); i++) {
        nes.cart.prgRam[i] = raw.charCodeAt(i);
      }
    } catch (e) {}
  }

  NES.prototype.saveRam = function () {
    if (!this.cart || !this.cart.battery) return;
    try {
      const key = "nes-prgram:" + hashRom(this.cart);
      let s = "";
      for (let i = 0; i < this.cart.prgRam.length; i++) s += String.fromCharCode(this.cart.prgRam[i]);
      localStorage.setItem(key, btoa(s));
    } catch (e) {}
  };

  function hashRom(cart) {
    let h = cart.mapperId + ":" + cart.prg.length + ":" + cart.chr.length;
    for (let i = 0; i < Math.min(64, cart.prg.length); i++) h += ":" + cart.prg[i];
    return h;
  }

  g.NES = NES;
  g.NesController = Controller;
})(typeof window !== "undefined" ? window : globalThis);
