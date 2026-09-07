# Bedroom scene art (v13)

## Approach

**Cleaned photo plate + CSS/SVG chrome** (not another hotspot percentage tweak).

1. **Clean plate** — Started from `assets/mock/bedroom-north-star.png` (guide mock). OpenCV inpainting removed baked mock UI: phosphor tooltip, green N64 outline glow, and white hand cursor. CRT glass was rebuilt with matched static (no baked `NO SIGNAL` / info bar). A grain-matched illustrated **GBA** was composited onto the bottom shelf (photo had GB / GBC / DS only). A soft illustrated **N64** cover restores a normal coming-soon console where inpainting blurred the body. Exports: `bedroom-scene.jpg` (1290×816) and `bedroom-scene-sm.jpg` (838×530). Regenerator (local, gitignored `tools/`): `clean_bedroom_plate.py`.

2. **Console-shaped hotspots** — Live systems (NES, SNES, Genesis, GB, GBC, GBA) use inline SVG `<path>` silhouettes (`.hotspot-sil`). Phosphor stroke + soft fill appear only on `:hover` / `:focus-visible` / `.selected`. Rectangular green boxes removed. Coming-soon (N64, PS1, Saturn, DS) stay visible in the plate, `pointer-events: none`, no silhouette, no click-to-play tip.

3. **CRT HUD** — `#room-tv-screen` uses a nested `.room-tv-hud-plane` with `perspective` + `rotateY` / `rotateX` / `skewX` so NO SIGNAL / AV-1 copy sits in the glass plane.

## SW

`gameroom-v13` — precache already lists both room JPEGs.
