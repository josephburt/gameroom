# GROK NES

A browser emulator for NES, Game Boy, Game Boy Color, and Super NES. Play the built-in NES demo, drop in a ROM you legally own, or load one from Google Drive.

**Play it:** [https://emu.burtlabs.org](https://emu.burtlabs.org)

Installable as a PWA. Recently played games (Star Fox, whatever you drop in) stay in this browser so they come back in one click. Savestates and rewind stay here too. NES netplay is a WebRTC room code; GB / SNES use EmulatorJS netplay.

## Systems

| System | Engine | Extensions |
|---|---|---|
| NES | Built-in (mappers 0 / 1 / 2 / 3 / 4 / 7) | `.nes` |
| Game Boy | EmulatorJS / gambatte | `.gb` |
| Game Boy Color | EmulatorJS / gambatte | `.gbc` |
| Super NES | EmulatorJS / snes9x | `.sfc` `.smc` |

Zipped dumps (`.zip`) are unpacked in the browser.

## Controls

| Button | Keyboard |
|---|---|
| D-Pad | Arrow keys or WASD |
| A | X or J |
| B | Z or K |
| SNES X / Y | V / C |
| SNES L / R | Q / E |
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

NES rewind is a few seconds of local snapshots. GB / SNES rewind uses the EmulatorJS / RetroArch option when the core supports it.

## Netplay

**NES:** Load the same ROM on both machines, then **Netplay → Create room** and share the code. The ROM is never sent. Play is delay-based (a few frames), not rollback.

**GB / SNES:** After the game starts, open the EmulatorJS settings menu and use its netplay. That stack talks to `netplay.emulatorjs.org`.

Symmetric NATs without TURN may fail. Treat GB / SNES netplay as best-effort.

## Load from Google Drive

Drive is a picker in the browser. ROM bytes never leave your machine except the Drive → tab download. You need a Google Cloud project (once):

1. Enable **Google Drive API** and **Google Picker API**.
2. OAuth consent screen: External, add yourself as a test user.
3. Create an OAuth **Web application** client ID. Authorized JavaScript origins:
   - `https://emu.burtlabs.org`
   - `http://localhost:8765` (local testing)
4. Create an API key.
5. Copy the **project number** from Cloud Console home (that is App ID).

Click **Drive** on the site and paste those three values. They are stored in this browser only (`localStorage`). Scope is `drive.file` — only files you pick.

Until Google verifies the app, only test users (you) can use it without the unverified-app warning.

## Hosting

Static site. GitHub Pages deploys from `main` via Actions. No server, database, or build step. Game Boy and SNES cores load from the EmulatorJS CDN.

Locally:

```
python3 -m http.server 8765
```

Then open `http://localhost:8765`.

## Legal

The site is MIT-licensed. Game Boy and SNES support uses [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS). No commercial games or BIOS files are bundled. Only load ROMs you have the right to use.
