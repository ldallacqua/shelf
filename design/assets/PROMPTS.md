# Generated asset prompts

Every image in `design/assets/` that was made by an image model is listed here with the exact
prompt that produced it, so any of them can be regenerated or revised.

## Rules

- **No game cover art is ever generated.** Covers and screenshots come from IGDB. Where a
  concept needs game cases, the prompt asks for abstract placeholder art with no text, logos or
  characters.
- Raw model output is not committed. Only optimised files are.
- Each asset ships as AVIF and WebP, with a JPEG fallback.

## How they were made

- **Tool:** Codex CLI 0.147 alpha (`codex exec`), using its built-in image generation tool. One run
  per image, asking for a single 1536×1024 image.
- **Optimised with** [sharp](https://sharp.pixelplumbing.com) 0.35 at 1536×1024: AVIF quality
  52, WebP quality 78, JPEG quality 80 (mozjpeg). The raw PNGs were about 2 MB each; the
  optimised files are 63 to 266 KB.

## Concept images for the three visual directions

Generated 12 Oct 2026 for [`docs/research.md`](../../docs/research.md), section 6. These are
mood references, not final assets. They do not ship in the app.

### A. Vitrine, dark theme

Files: `concepts/a-vitrine-dark.avif`, `.webp`, `.jpg`

```text
Photorealistic architectural visualization, landscape 3:2. A museum "visible storage" wall after closing time, displaying a personal collection of video game cases. Deep viridian-green painted gallery wall (hex 17231F). Three long, thin floating ledges of blackened steel, each with a slim brushed-brass front lip and a few small blank brass label plates. On each ledge about forty slim plastic video game cases stand upright, spine-out, tightly packed like books, with varied spine colours (muted blue, red, white, black, translucent green plastic) and slightly varied heights; three or four cases are turned face-out. Each shelf bay is lit from above by its own narrow-beam warm 3000K museum spotlight, forming soft overlapping pools of light on the spines with gentle falloff into darkness between pools, faint visible light cones in the air. One case is pulled forward and floats in front of the middle shelf, rotated three-quarters to show its front cover, crisply lit, while everything behind it is slightly dimmer and softly out of focus. Polished dark stone floor with a faint reflection. Quiet, reverent, cinematic. Camera straight-on and slightly off-axis, 35mm lens, shallow depth of field, high dynamic range, subtle film grain. All game case covers and spines are blank abstract placeholders: flat colours and simple geometric colour blocks only. Absolutely no text, no letters, no numbers, no logos, no characters, no real game artwork, no brand marks, no console logos anywhere in the image.
```

### A. Vitrine, light theme

Files: `concepts/a-vitrine-light.avif`, `.webp`, `.jpg`

```text
Photorealistic architectural visualization, landscape 3:2. A daylit museum "visible storage" wall displaying a personal collection of video game cases. Pale lichen-grey plaster wall (hex ECEEEA). Three long, thin floating ledges of honed pale limestone, each with a slim brushed-brass front lip and a few small blank brass label plates. On each ledge about forty slim plastic video game cases stand upright, spine-out, tightly packed like books, with varied spine colours (blue, red, white, black, translucent green plastic) and slightly varied heights; three or four cases are turned face-out. Soft diffuse skylight from above left, no spotlights; long soft shadows under the ledges and delicate contact shadows under the cases. One case is pulled forward and floats in front of the middle shelf, rotated three-quarters to show its front cover. Pale terrazzo floor. Airy, calm, precise, contemporary design museum. Camera straight-on and slightly off-axis, 35mm lens, gentle depth of field, natural colour. All game case covers and spines are blank abstract placeholders: flat colours and simple geometric colour blocks only. Absolutely no text, no letters, no numbers, no logos, no characters, no real game artwork, no brand marks, no console logos anywhere in the image.
```

### B. Golden Hour, dark theme

Files: `concepts/b-goldenhour-dark.avif`, `.webp`, `.jpg`

```text
Photorealistic interior photograph, landscape 3:2. A collector's living room in the evening. A white-oak cube shelving unit, four columns by three rows of square bays, filled with video game cases standing spine-out, tightly packed, varied spine colours (blue, red, white, black, translucent green); a few cases face-out. A warm 2700K LED strip is hidden under the top edge of every bay and casts a soft amber glow down the spines, pooling on the oak. The rest of the room falls into deep blue-hour navy shadow (hex 131A26). A floor lamp glows softly just out of frame on the right. A small potted plant and a plain game controller rest on top of the unit. In one bay, a single case is tipped forward out of the row, as if a finger had hooked the top of its spine. Cozy, lived-in, intimate. Camera at standing eye level facing the shelf, 35mm lens, shallow depth of field, soft natural grain. All game case covers and spines are blank abstract placeholders: flat colours and simple geometric colour blocks only. Absolutely no text, no letters, no numbers, no logos, no characters, no real game artwork, no brand marks, no console logos anywhere in the image.
```

### B. Golden Hour, light theme

Files: `concepts/b-goldenhour-light.avif`, `.webp`, `.jpg`

```text
Photorealistic interior photograph, landscape 3:2. A collector's living room on a sunny morning. A white-oak cube shelving unit, four columns by three rows of square bays, filled with video game cases standing spine-out, tightly packed, varied spine colours (blue, red, white, black, translucent green); a few cases face-out. Low morning sun comes through window blinds on the left and throws warm diagonal bars of light across the shelves and the pale blue-grey painted wall (hex E4EAEE); shadows are cool and soft; a few dust motes hang in the sunbeams. A small potted plant and a plain game controller rest on top of the unit. In one bay, a single case is tipped forward out of the row, as if a finger had hooked the top of its spine. Warm, bright, lived-in. Camera at standing eye level facing the shelf, 35mm lens, gentle depth of field. All game case covers and spines are blank abstract placeholders: flat colours and simple geometric colour blocks only. Absolutely no text, no letters, no numbers, no logos, no characters, no real game artwork, no brand marks, no console logos anywhere in the image.
```

### C. Locadora, dark theme

Files: `concepts/c-locadora-dark.avif`, `.webp`, `.jpg`

```text
Photorealistic photograph, landscape 3:2. The wall of a small 1990s neighbourhood video game rental shop at closing time. White slatwall panels with wire shelves densely packed with video game cases: the top row face-out, the lower four rows spine-out, hundreds of cases in many saturated colours. Blank yellow plastic shelf-talker tabs stick out between sections as category dividers. Some cases carry small blank round red and yellow price stickers. Only half of the ceiling fluorescent tubes are on, casting cool white light in bands; the unlit areas fall into deep indigo shadow (hex 141338). On the corner of a laminate counter in the foreground a small CRT television glows with abstract soft colour. Nostalgic, energetic, a little gritty. Camera at standing eye level, 28mm lens, slight perspective down the aisle, moderate depth of field, fine grain. All game case covers and spines are blank abstract placeholders: flat colours and simple geometric colour blocks only. Absolutely no text, no letters, no numbers, no logos, no characters, no real game artwork, no brand marks, no console logos anywhere in the image.
```

### C. Locadora, light theme

Files: `concepts/c-locadora-light.avif`, `.webp`, `.jpg`

```text
Photorealistic photograph, landscape 3:2. The wall of a small 1990s neighbourhood video game rental shop on a bright Saturday afternoon. White slatwall panels with wire shelves densely packed with video game cases: the top row face-out, the lower four rows spine-out, hundreds of cases in many saturated colours. Blank yellow plastic shelf-talker tabs (hex FFD21F) stick out between sections as category dividers; blank cobalt-blue and red signage panels hang above. Some cases carry small blank round red and yellow price stickers. Bright, even, cool fluorescent light, crisp and clean, saturated primary colours, graphic and cheerful. A laminate counter edge in the foreground. Camera at standing eye level, 28mm lens, slight perspective down the aisle, deep focus. All game case covers and spines are blank abstract placeholders: flat colours and simple geometric colour blocks only. Absolutely no text, no letters, no numbers, no logos, no characters, no real game artwork, no brand marks, no console logos anywhere in the image.
```

## Concept images for the fourth direction, Backlit

Generated 12 Oct 2026 for [`docs/adr/002-visual-direction.md`](../../docs/adr/002-visual-direction.md),
after the first direction was rejected for reading as a library of books. Same tool and same
optimisation as above. These are mood references and the target for the 3D shelf. They do not
ship in the app.

### D. Backlit, dark theme

Files: `concepts/d-backlit-dark.avif`, `.webp`, `.jpg`

```text
Photorealistic interior photograph, landscape 3:2. A gamer's display wall at night with the room lights off. Matte near-black wall (hex 0B0D12). Four long, thin, matte black floating shelves run the full width of the wall. Each shelf has a hidden LED light bar along its back edge that washes the wall behind and above the games with saturated violet light (hex 7C5CFF), brightest at the shelf and fading upward, and spills a softer glow onto the wall just below the shelf. On each shelf about fourteen video game cases stand upright FACING OUT, front covers toward the camera, side by side with small even gaps, leaning very slightly back against the wall. The LED light bleeds through the gaps and over the tops, so every case is rimmed with a thin halo of coloured light: the covers are backlit. The cases are ordinary plastic game cases in a few sizes, with coloured plastic frames: translucent blue, red, green, white and black. In the middle shelf, one case is pulled forward toward the camera, larger and crisply lit, and the LED light on that one shelf has changed to a warm orange that matches that case, while the other shelves stay violet. Glossy shelf tops carry a faint reflection of the cases. Dark polished floor with a soft coloured reflection. Premium gaming setup, moody and cinematic, like a high-end battlestation photograph, not a bookshelf. Camera straight-on and slightly off-axis, 35mm lens, shallow depth of field, high dynamic range, subtle grain. All game case covers are blank abstract placeholders: flat colours and simple geometric colour blocks only. Absolutely no text, no letters, no numbers, no logos, no characters, no real game artwork, no brand marks, no console logos anywhere in the image.
```

### D. Backlit, light theme

Files: `concepts/d-backlit-light.avif`, `.webp`, `.jpg`

```text
Photorealistic interior photograph, landscape 3:2. A gamer's display wall in the daytime with the room lights on. Cool light-grey wall (hex ECEEF2) in soft, even daylight. Four long, thin, matte graphite-black floating shelves run the full width of the wall. Each shelf has an LED light bar along its back edge; in daylight it shows as a thin bright violet line (hex 7C5CFF) and a faint violet tint on the wall directly behind the games and just under the shelf. On each shelf about fourteen video game cases stand upright FACING OUT, front covers toward the camera, side by side with small even gaps, leaning very slightly back against the wall. The cases are ordinary plastic game cases in a few sizes, with coloured plastic frames: translucent blue, red, green, white and black. In the middle shelf, one case is pulled forward toward the camera, larger and crisply lit, and the light on that one shelf has shifted to a warm orange tint that matches that case. Soft, short shadows under the shelves. Pale polished concrete floor. Clean, crisp, modern gaming setup photographed like a product display in a bright studio, not a bookshelf. Camera straight-on and slightly off-axis, 35mm lens, gentle depth of field, natural colour. All game case covers are blank abstract placeholders: flat colours and simple geometric colour blocks only. Absolutely no text, no letters, no numbers, no logos, no characters, no real game artwork, no brand marks, no console logos anywhere in the image.
```
