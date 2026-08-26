# GROK NES

A browser emulator for NES, Game Boy, and Game Boy Color. Play the built-in NES demo, drop in a ROM you legally own, or load one from Google Drive.

**Play it:** [https://emu.burtlabs.org](https://emu.burtlabs.org)

## Systems

| System | Engine | Extensions |
|---|---|---|
| NES | Built-in (mappers 0 / 1 / 2 / 3 / 4 / 7) | `.nes` |
| Game Boy | EmulatorJS / gambatte | `.gb` |
| Game Boy Color | EmulatorJS / gambatte | `.gbc` |

Zipped dumps (`.zip`) are unpacked in the browser.

## Controls

| Button | Keyboard |
|---|---|
| D-Pad | Arrow keys or WASD |
| A | Z or J |
| B | X or K |
| Start | Enter |
| Select | Shift or Space |
| Pause | P |
| Reset | R |

Xbox / DualShock / generic pads work after you press a button on them.

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

Static site. GitHub Pages deploys from `main` via Actions. No server, database, or build step. Game Boy cores load from the EmulatorJS CDN.

Locally:

```
python3 -m http.server 8765
```

Then open `http://localhost:8765`.

## Legal

The site is MIT-licensed. Game Boy support uses [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS). No commercial games are bundled. Only load ROMs you have the right to use.
