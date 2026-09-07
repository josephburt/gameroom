# Burt Labs GameRoom

A living-room style browser emulator for NES, Super NES, Game Boy, Game Boy Color, Game Boy Advance, and Sega Genesis. Play the built-in NES demo, drop in a ROM you legally own, attach a local **Bookshelf** folder (Chromium), or load one from Google Drive.

**Play it:** [https://gameroom.burtlabs.org](https://gameroom.burtlabs.org)

> **Domain:** Primary host is **`gameroom.burtlabs.org`**. The older `emu.burtlabs.org` name may stay as an optional redirect later.

Installable as a PWA. Recently played games stay in this browser so they come back in one click. Savestates and rewind stay here too. NES netplay is a WebRTC room code; other systems use EmulatorJS netplay where available.

## Systems

| System | Engine | Extensions | Status |
|---|---|---|---|
| NES | Built-in (mappers 0 / 1 / 2 / 3 / 4 / 7) | `.nes` | Phase 1 |
| Super NES | EmulatorJS / snes9x | `.sfc` `.smc` | Phase 1 |
| Game Boy | EmulatorJS / gambatte | `.gb` | Phase 1 |
| Game Boy Color | EmulatorJS / gambatte | `.gbc` | Phase 1 |
| Game Boy Advance | EmulatorJS / mgba (`gba`) | `.gba` | Phase 1 |
| Sega Genesis / Mega Drive | EmulatorJS / genesis_plus_gx (`segaMD`) | `.md` `.gen` `.smd` | Phase 1 |
| PS1 · N64 · DS · Saturn | — | — | Coming soon (placeholders) |
| PS2 · GameCube · Wii · Xbox | — | — | Not planned for this phase |

Zipped dumps (`.zip`) are unpacked in the browser.

## Controls

| Button | Keyboard |
|---|---|
| D-Pad | Arrow keys or WASD |
| A | X or J |
| B | Z or K |
| SNES / Genesis extras | V / C · L/R = Q / E |
| Start | Enter |
| Select | Shift or Space |
| Pause | P |
| Reset | R |
| Rewind | Hold Backspace |
| Turbo | Hold Tab |
| Quick save / load | F5 / F7 |
| Screenshot | F8 |
| Hotkeys | ? |

Xbox / DualShock / generic pads work after you press a button on them. Phones get an on-screen pad.

## Save states and rewind

Slots 0–9 live in IndexedDB on this device (slot 0 is also written when you hide the tab). They do not upload anywhere.

NES rewind is a few seconds of local snapshots. EmulatorJS systems use the core / RetroArch rewind option when supported.

## Netplay

**NES:** Load the same ROM on both machines, then **Netplay → Create room** and share the code. The ROM is never sent. Play is delay-based (a few frames), not rollback.

**GB / SNES / GBA / Genesis:** After the game starts, open the EmulatorJS settings menu and use its netplay. That stack talks to `netplay.emulatorjs.org`.

Symmetric NATs without TURN may fail. Treat EmulatorJS netplay as best-effort.


## Local Bookshelf + BIOS folders (Chromium)

On Chrome, Edge, and other Chromium browsers, GameRoom can attach local folders with the File System Access API:

1. **Bookshelf folder** — pick a directory of ROMs you own (`.nes` `.gb` `.gbc` `.gba` `.sfc` `.smc` `.md` `.gen` `.smd` `.zip`, plus a few aliases). GameRoom scans a few levels deep, lists games in a Bookshelf dialog, and loads the chosen file through the same pipeline as disk / Drive / zip picks.
2. **BIOS folder** (optional, separate control) — pick a folder that contains legally obtained system files such as `gba_bios.bin`, `gb_bios.bin`, or `gbc_bios.bin`. When a matching EmulatorJS core starts (GBA mgba, and optional GB/GBC boot ROMs), GameRoom creates a temporary blob URL and sets `EJS_biosUrl`. BIOS bytes are **never** committed to the repo or uploaded.

Folder handles are stored in IndexedDB on this device. On the next visit Chromium may ask you to re-allow access (`queryPermission` / `requestPermission`). Safari and Firefox hide these controls and keep the normal file input + Google Drive paths.

## Load from Google Drive

Drive is a picker in the browser. ROM bytes never leave your machine except the Drive → tab download. You need a Google Cloud project (once):

1. Enable **Google Drive API** and **Google Picker API**.
2. OAuth consent screen: External, add yourself as a test user.
3. Create an OAuth **Web application** client ID. Authorized JavaScript origins:
   - `https://gameroom.burtlabs.org`
   - `http://localhost:8765` (local testing)
4. Create an API key.
5. Copy the **project number** from Cloud Console home (that is App ID).

Click **Drive** on the site and paste those three values. They are stored in this browser only (`localStorage`). Scope is `drive.file` — only files you pick.

Until Google verifies the app, only test users (you) can use it without the unverified-app warning.

## Hosting

Static site. GitHub Pages deploys from `main` via Actions. No server, database, or build step. EmulatorJS cores load from the EmulatorJS CDN.

Locally:

```
python3 -m http.server 8765
```

Then open `http://localhost:8765`.

## Legal

The site is MIT-licensed. Multi-system support uses [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS). No commercial games or BIOS files are bundled. Only load ROMs and BIOS files you have the right to use — local folder pickers never upload those bytes.
