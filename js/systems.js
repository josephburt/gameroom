/* Shared system catalog. Home links and the play page both read this. */
(function (g) {
  "use strict";

  const SPECS = {
    nes: {
      id: "nes",
      label: "NES",
      short: "NES",
      kicker: "8-bit",
      desc: "Custom core",
      accept: ".nes,.NES,.unf,.zip,.ZIP",
      exts: ["nes", "unf", "unif", "fds", "zip"],
      meter: "Mapper",
      color: "#ff4d5e",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A", "X / J"],
        ["B", "Z / K"],
        ["Start", "Enter"],
        ["Select", "Shift / Space"],
        ["Rewind", "Hold Backspace"],
        ["Turbo", "Hold Tab"]
      ],
      note: "Xbox / DualShock / generic pads work after you press a button. Netplay is a room code for NES.",
      prompt: "Load a .nes ROM from your library, disk, or Drive."
    },
    snes: {
      id: "snes",
      label: "Super NES",
      short: "SNES",
      kicker: "16-bit",
      desc: "snes9x",
      accept: ".sfc,.SFC,.smc,.SMC,.fig,.zip,.ZIP",
      exts: ["sfc", "smc", "fig", "swc", "zip"],
      meter: "System",
      core: "snes",
      color: "#818cf8",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A / B", "X / Z"],
        ["X / Y", "V / C"],
        ["L / R", "Q / E"],
        ["Start / Select", "Enter / Shift"]
      ],
      note: "Star Fox and other Super FX games run through snes9x. First load fetches the core; after that it stays cached.",
      prompt: "Load a .sfc / .smc ROM. Super FX games fetch the core on first play."
    },
    n64: {
      id: "n64",
      label: "Nintendo 64",
      short: "N64",
      kicker: "64-bit",
      desc: "mupen64plus",
      accept: ".z64,.Z64,.n64,.N64,.v64,.V64,.zip,.ZIP",
      exts: ["z64", "n64", "v64", "zip"],
      meter: "System",
      core: "n64",
      color: "#c9a227",
      keys: [
        ["Stick / D-Pad", "Arrow keys / WASD"],
        ["A / B", "X / Z"],
        ["C-Left / C-Right", "C / V"],
        ["L / R / Z", "Q / E / Space"],
        ["Start", "Enter"]
      ],
      note: "N64 is demanding in the browser. Desktop Chrome works best. Large dumps are not kept in Continue — load them from your library each time.",
      prompt: "Load a .z64 / .n64 / .v64 ROM. First load fetches a large core."
    },
    gb: {
      id: "gb",
      label: "Game Boy",
      short: "GB",
      kicker: "Handheld",
      desc: "gambatte",
      accept: ".gb,.GB,.zip,.ZIP",
      exts: ["gb", "sgb", "dmg", "zip"],
      meter: "System",
      core: "gb",
      color: "#9bbc0f",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A", "X / J"],
        ["B", "Z / K"],
        ["Start", "Enter"],
        ["Select", "Shift"]
      ],
      note: "Optional BIOS is not bundled. Attach a BIOS folder if you own gb_bios.bin.",
      prompt: "Load a .gb ROM from your library, disk, or Drive."
    },
    gbc: {
      id: "gbc",
      label: "Game Boy Color",
      short: "GBC",
      kicker: "Color",
      desc: "gambatte",
      accept: ".gbc,.GBC,.gb,.GB,.zip,.ZIP",
      exts: ["gbc", "gb", "sgb", "dmg", "zip"],
      meter: "System",
      core: "gb",
      color: "#a78bfa",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A", "X / J"],
        ["B", "Z / K"],
        ["Start", "Enter"],
        ["Select", "Shift"]
      ],
      note: "Game Boy Color uses the same core as Game Boy. .gb games also run here.",
      prompt: "Load a .gbc or .gb ROM from your library, disk, or Drive."
    },
    gba: {
      id: "gba",
      label: "Game Boy Advance",
      short: "GBA",
      kicker: "Advance",
      desc: "mgba",
      accept: ".gba,.GBA,.agb,.AGB,.zip,.ZIP",
      exts: ["gba", "agb", "mb", "zip"],
      meter: "System",
      core: "gba",
      color: "#6b8afd",
      keys: [
        ["D-Pad", "Arrow keys / WASD"],
        ["A / B", "X / Z"],
        ["L / R", "Q / E"],
        ["Start / Select", "Enter / Shift"]
      ],
      note: "Optional BIOS is not bundled — attach a BIOS folder if you own gba_bios.bin. Most games boot without it.",
      prompt: "Load a .gba ROM. BIOS is optional if you own gba_bios.bin."
    }
  };

  const ORDER = ["nes", "snes", "n64", "gb", "gbc", "gba"];

  function fromQuery() {
    try {
      const q = new URLSearchParams(location.search).get("sys") || "";
      return SPECS[q] ? q : "";
    } catch (e) {
      return "";
    }
  }

  function playUrl(sys, extra) {
    extra = extra || {};
    const parts = ["sys=" + encodeURIComponent(sys)];
    if (extra.resume) parts.push("resume=" + encodeURIComponent(extra.resume));
    if (extra.demo) parts.push("demo=1");
    return "play.html?" + parts.join("&");
  }

  g.GrokSystems = {
    byId: SPECS,
    order: ORDER,
    isEjs: function (sys) { return !!(SPECS[sys] && SPECS[sys].core); },
    fromQuery: fromQuery,
    playUrl: playUrl
  };
})(typeof window !== "undefined" ? window : globalThis);
