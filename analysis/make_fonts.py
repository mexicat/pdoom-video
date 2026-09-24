# Generate static font instances for the renderer (canvas + opentype.js need static outlines).
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from pathlib import Path
src = Path('../app/public/fonts/src'); out = Path('../app/public/fonts')
jobs = []
for wd in [62, 75, 87.5, 100, 112.5, 125]:
    for wt in [300, 500, 700, 900]:
        jobs.append(('Archivo[wdth,wght].ttf', {'wdth': wd, 'wght': wt}, f'Archivo-w{int(wd*10)}-{wt}.ttf'))
for wd in [75, 100]:
    for wt in [400, 800]:
        jobs.append(('Archivo-Italic[wdth,wght].ttf', {'wdth': wd, 'wght': wt}, f'ArchivoItalic-w{int(wd*10)}-{wt}.ttf'))
for wt in [400, 600]:
    jobs.append(('CormorantGaramond[wght].ttf', {'wght': wt}, f'Cormorant-{wt}.ttf'))
    jobs.append(('CormorantGaramond-Italic[wght].ttf', {'wght': wt}, f'CormorantItalic-{wt}.ttf'))
for s, loc, name in jobs:
    f = TTFont(src / s)
    inst = instancer.instantiateVariableFont(f, loc, updateFontNames=False)
    inst.save(out / name)
print(len(jobs), 'instances')
