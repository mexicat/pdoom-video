# Russian display support

`Archivo-*.ttf` and `ArchivoItalic-*.ttf` supplement the original Archivo fonts
with Cyrillic outlines from Noto Sans. Original Latin outlines are preserved.
The added glyphs follow the corresponding weight and width; italic variants
use a slant transform. These are project-local derivatives.

Copyright 2020 The Archivo Project Authors
(https://github.com/Omnibus-Type/Archivo)

Copyright 2022 The Noto Project Authors
(https://github.com/notofonts/latin-greek-cyrillic)

Both sources use SIL Open Font License 1.1; see `OFL.txt` and `../src/OFL.txt`.

`stroke.json` contains flattened Cyrillic outlines from the already bundled
Cormorant italic and Noto Sans fonts for the original progressive drawing effects.
`analysis/russian_fonts.py` regenerates all these assets.
