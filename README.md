# Burt Labs GameRoom

A living-room style browser emulator for NES, Super NES, Game Boy, Game Boy Color, Game Boy Advance, and Nintendo 64. Pick a console on the shelf; each one opens its own library page. Play the built-in NES demo, drop in a ROM you legally own, attach a local folder (Chromium), or load one from Google Drive.

**Play it:** [https://gameroom.burtlabs.org](https://gameroom.burtlabs.org)

> **Domain:** Primary host is **`gameroom.burtlabs.org`**. The older `emu.burtlabs.org` name may stay as an optional redirect later.

Installable as a PWA. Recently played games stay in this browser so they come back in one click. Savestates and rewind stay here too. NES netplay is a WebRTC room code; other systems use EmulatorJS netplay where available.

## Systems

| System | Engine | Extensions | Status |
|---|---|---|---|
| NES | Built-in (mappers 0 / 1 / 2 / 3 / 4 / 7) | `.nes` | Live |
| Super NES | EmulatorJS / snes9x | `.sfc` `.smc` | Live |
| Game Boy | EmulatorJS / gambatte | `.gb` | Live |
| Game Boy Color | EmulatorJS / gambatte | `.gbc` `.gb` | Live |
| Game Boy Advance | EmulatorJS / mgba (`gba`) | `.gba` | Live |
| Nintendo 64 | EmulatorJS / mupen64plus (`n64`) | `.z64` `.n64` `.v64` | Live |

Zipped dumps (`.zip`) are unpacked in the browser. Each console page only loads that system.

## Controls

| Button | Keyboard |
|---|---|
| D-Pad | Arrow keys or WASD |
| A | X or J |
| B | Z or K |
| SNES extras | V / C · L/R = Q / E |
| N64 Z | Space |
| Start | Enter |
| Select | Shift or Space (NES / GB / SNES) |
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

Large N64 dumps are not copied into Continue (browser storage quota). Load them again from your library folder or disk.

## Netplay

**NES:** Load the same ROM on both machines, then **Netplay → Create room** and share the code. The ROM is never sent. Play is delay-based (a few frames), not rollback.

**GB / SNES / GBA / N64:** After the game starts, open the EmulatorJS settings menu and use its netplay. That stack talks to `netplay.emulatorjs.org`.

Symmetric NATs without TURN may fail. Treat EmulatorJS netplay as best-effort.

## Local library + BIOS folders (Chromium)

On Chrome, Edge, and other Chromium browsers, GameRoom can attach local folders with the File System Access API:

1. **Library folder** — pick a directory of ROMs you own. The console page lists only files for that system.
2. **BIOS folder** (optional for GBA/GB/GBC) — pick a folder that contains legally obtained system files such as `gba_bios.bin`. When a matching EmulatorJS core starts, GameRoom creates a temporary blob URL and sets `EJS_biosUrl`. BIOS bytes are **never** committed to the repo or uploaded.

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

Click **Drive** on a console page and paste those three values. They are stored in this browser only (`localStorage`). Scope is `drive.file` — only files you pick.

Until Google verifies the app, only test users (you) can use it without the unverified-app warning.

## Desktop-first

GameRoom is built for a full desktop web browser. The room is a TV and shelf; picking a console opens that system’s library page, where you load a ROM. It still runs in mobile and non-desktop browsers, but the layout, controls, and emulator are tuned for desktop — on smaller/touch devices a banner points this out. Nintendo 64 in particular wants desktop Chrome.

## Hosting

Static site. GitHub Pages deploys from `main` via Actions. No server, database, or build step. EmulatorJS cores load from the EmulatorJS CDN.

Locally:

```
python3 -m http.server 8765
```

Then open `http://localhost:8765`.

## Legal

The site is MIT-licensed. Multi-system support uses [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS). No commercial games or BIOS files are bundled. Only load ROMs and BIOS files you have the right to use — local folder pickers never upload those bytes.
