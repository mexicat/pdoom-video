"""Build Cyrillic display faces from OFL Noto Sans (source kept beside output)."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
fonts=Path(__file__).resolve().parents[1]/'app/public/fonts/ru'
for weight in (400,600,900):
    f=TTFont(fonts/'NotoSans-variable.ttf')
    instantiateVariableFont(f,{'wdth':85,'wght':weight},inplace=True)
    f.save(fonts/f'NotoSans-{weight}.ttf')

# Add Cyrillic to the original display faces without changing Latin outlines.
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
base=Path(__file__).resolve().parents[1]/'app/public/fonts'
for path in base.glob('Archivo*.ttf'):
 parts=path.stem.split('-'); width=int(parts[1][1:])/10; weight=int(parts[2])
 src=TTFont(base/'ru/NotoSans-variable.ttf'); instantiateVariableFont(src,{'wdth':max(75,min(100,width)),'wght':weight},inplace=True)
 dst=TTFont(path); cmap=src.getBestCmap(); gs=src.getGlyphSet(); order=list(dst.getGlyphOrder()); mapping={}
 scale=dst['head'].unitsPerEm/src['head'].unitsPerEm
 sx=scale*width/max(75,min(100,width)); slant=.17 if 'Italic' in path.name else 0
 for cp,name in cmap.items():
  if not (0x400<=cp<=0x52f): continue
  new=f'ru{cp:04X}'; pen=TTGlyphPen(None); rec=DecomposingRecordingPen(gs); gs[name].draw(rec); rec.replay(TransformPen(pen,(sx,0,slant,scale,0,0)))
  dst['glyf'][new]=pen.glyph(); aw,lsb=src['hmtx'][name];dst['hmtx'][new]=(round(aw*sx),round(lsb*sx));order.append(new);mapping[cp]=new
 dst.setGlyphOrder(order)
 for tab in dst['cmap'].tables:
  if tab.isUnicode(): tab.cmap.update(mapping)
 dst.save(base/'ru'/path.name)
print('Cyrillic glyphs added to original Archivo faces; Latin outlines preserved.')

# Outline-based Cyrillic for the original write-on effects.
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
class Flatten(BasePen):
 def __init__(self,gs):super().__init__(gs);self.paths=[]
 def _moveTo(self,p):self.paths.append([p])
 def _lineTo(self,p):self.paths[-1].append(p)
 def _curveToOne(self,a,b,c):
  p=self._getCurrentPoint()
  for i in range(1,13):
   t=i/12;u=1-t;self._lineTo(tuple(u**3*p[j]+3*u*u*t*a[j]+3*u*t*t*b[j]+t**3*c[j] for j in (0,1)))
 def _qCurveToOne(self,a,b):
  p=self._getCurrentPoint()
  for i in range(1,9):
   t=i/8;u=1-t;self._lineTo(tuple(u*u*p[j]+2*u*t*a[j]+t*t*b[j] for j in (0,1)))
 def _closePath(self):self._lineTo(self.paths[-1][0])
 def _endPath(self):pass
out={}
for style,file in [('script','CormorantItalic-600.ttf'),('sans','ru/NotoSans-600.ttf')]:
 f=TTFont(Path(__file__).resolve().parents[1]/'app/public/fonts'/file);gs=f.getGlyphSet(); glyphs={}
 for cp,n in f.getBestCmap().items():
  if not 0x400<=cp<=0x52f:continue
  p=Flatten(gs);gs[n].draw(p);glyphs[chr(cp)]={'adv':f['hmtx'][n][0],'strokes':[[{'x':x,'y':y} for x,y in st] for st in p.paths]}
 out[style]={'cap':f['OS/2'].sCapHeight,'glyphs':glyphs}
(Path(__file__).resolve().parents[1]/'app/public/fonts/ru/stroke.json').write_text(json.dumps(out,separators=(',',':'),ensure_ascii=False))
