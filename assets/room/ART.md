# Bedroom scene art (v14)

## Approach

**LaMa inpaint of full baked mock chrome + CRT glass rebuild** (goes beyond #10 / v13, which only scrubbed hotspot overlays and then re-composited floating sprites).

1. **Source** — `assets/mock/bedroom-north-star.png` (1536×1024 guide mock). That bitmap still contains the full mock UI: GROK NES top bar, left Consoles/Saved Games/… nav, Tip + Ready/`grok-nes v0.1.0` panel, bottom Load game / Google Drive / Continue bar, CRT NO SIGNAL HUD, N64 tooltip / green outline / hand cursor.

2. **Clean plate** — Mask those chrome regions (left strip through Ready/version at ~y=650–720, top bar, bottom button bar, CRT glass, N64 tooltip + lime outline ring + cursor) and fill with **LaMa** (`simple-lama-inpainting`). Rebuild CRT glass as feathered elliptical static sampled from the mock’s clean blue snow (no baked text). **Do not** composite floating illustrated N64/GBA sprites — shelf hardware only.

3. **Proof** — Contrast-boosted Tesseract OCR on the exported JPEG returns empty / no hits for GROK NES, Consoles, Saved Games, Load game, Google Drive, Continue, Ready, grok-nes, v0.1.0, NO SIGNAL, click to play. Lime-pixel count in the N64 hotspot zone is 0. Viewing `bedroom-scene.jpg` alone shows only the bedroom entertainment center.

4. **Live chrome stays HTML/CSS/SVG** — `#10` silhouette hotspots + CRT HUD (`.room-tv-hud`) unchanged in spirit; exports keep 1290×816 / 838×530 so hotspot percentages remain valid.

## Exports

- `bedroom-scene.jpg` — 1290×816
- `bedroom-scene-sm.jpg` — 838×530

Regenerator (local, under gitignored `tools/`): `clean_bedroom_plate_v14.py`.

## SW

`gameroom-v14` — precache already lists both room JPEGs.
