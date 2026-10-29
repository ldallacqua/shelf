# Fonts

| Use | Family | File | How it is loaded |
| --- | --- | --- | --- |
| Interface | Archivo, normal width, all weights | From Google Fonts at build time | `next/font/google` |
| Titles | Archivo at width 118, weight 800 | `archivo-title.woff2`, 13 KB | `next/font/local` |
| Numbers and labels | Martian Mono, weight 500 | From Google Fonts at build time | `next/font/google` |

## Martian Mono's stand-in

next/font gives each Google font a stand-in while it loads: Arial, scaled so its average
character is as wide. For a monospace that is far off. Every Martian Mono character is
0.7 em wide, and scaled Arial drew an uppercase label half as wide again ("GAMES" was
65.7 pixels, not 41.8), so the stats line above the shelf broke onto a second line and the
whole shelf moved down when the real font arrived: a layout shift of 0.18 on a phone.

So Martian Mono's stand-in is a system monospace instead, defined in `globals.css`: Courier
New, Menlo, Lucida Console, or the monospace of Linux or Android, whichever the device has.
Each is 0.6 em wide, so at 116.67% every character is exactly as wide as Martian Mono's.

## Why the title font is a file in this folder

Archivo's width axis is what makes a title wide. The whole family with that axis is 88 KB,
and a phone would wait for it before showing any text in its final form. Titles only ever
use one width and one weight, so that one style is cut out of the family and kept here.

`archivo-title.woff2` was made from the family's source file,
[`Archivo[wdth,wght].ttf`](https://github.com/google/fonts/tree/main/ofl/archivo), with
[fontTools](https://github.com/fonttools/fonttools):

```python
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

font = instancer.instantiateVariableFont(TTFont("Archivo[wdth,wght].ttf"), {"wdth": 118, "wght": 800})

options = subset.Options()
# The same characters as Google Fonts' "latin" subset: English and Portuguese are covered.
options.unicodes = subset.parse_unicodes(
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
    "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
)
options.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "lnum", "case"]
options.flavor = "woff2"

subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=options.unicodes)
subsetter.subset(font)
font.flavor = "woff2"
font.save("archivo-title.woff2")
```

## The trophy card's fonts

The card a shared trophy page shows (`app/api/v1/libraries/[key]/trophies/card`) is drawn by
`next/og`, which reads TrueType but not WOFF2. So `card/` holds the same styles as TTF, cut
from the files the build already serves, with fontTools:

| File | From | How |
| --- | --- | --- |
| `archivo-title.ttf`, 37 KB | `archivo-title.woff2` here | Saved without WOFF2's compression |
| `archivo-700.ttf`, 41 KB | Archivo's Latin file from Google Fonts, weight axis 100 to 900 | `instancer.instantiateVariableFont(font, {"wght": 700})` |
| `martian-mono-500.ttf`, 24 KB | Martian Mono 500's Latin file from Google Fonts | Saved without WOFF2's compression |

The route reads them once per server instance, by path from the project's folder, which
Next.js traces into the deployed function.

## License

Archivo and Martian Mono are licensed under the SIL Open Font License 1.1, which allows modified versions to
be redistributed under the same license. The license is in [`OFL.txt`](OFL.txt). The family
declares no reserved font name.

When the compact, spine-out shelf arrives (build step 3), its narrow lettering gets a file of
its own, made the same way.
