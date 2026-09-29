"""Render the original animation in bounded browser sessions, then mux the Russian master."""
from pathlib import Path
import json, os, subprocess, time, hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'out/ru/v2/scenes'
OUT.mkdir(parents=True,exist_ok=True)
FPS=60
DURATION=json.loads((ROOT/'data/ru/audio.json').read_text())['duration']
TOTAL=round(DURATION*FPS)
env=dict(os.environ)
env['PATH']=str(Path.home()/'.bun/bin')+os.pathsep+env.get('PATH','')
# A changed render input must invalidate cached chunks.
fingerprint=hashlib.sha256()
for base in ['app/src','app/public/fonts','app/public/plates','data']:
 for path in sorted((ROOT/base).rglob('*')):
  if path.is_file():fingerprint.update(str(path.relative_to(ROOT)).encode());fingerprint.update(path.read_bytes())
for name in ['app/index.html','app/vite.config.ts','app/scripts/render.ts','app/plates.json','analysis/render_russian.py']:
 path=ROOT/name
 fingerprint.update(name.encode());fingerprint.update(path.read_bytes())
fingerprint.update((ROOT/'audio/pdoom-ru-v2.m4a').read_bytes())
key=fingerprint.hexdigest(); stamp=OUT/'source.sha256'
if stamp.exists() and stamp.read_text()!=key:
 for path in OUT.glob('part-*'):path.unlink()
stamp.write_text(key)
start=time.time()
parts=[]
for i,n0 in enumerate(range(0,TOTAL,900)):
    n1=min(n0+900,TOTAL)
    part=OUT/f'part-{i:02d}.mp4'
    log=OUT/f'part-{i:02d}.log'
    parts.append(part)
    def valid():
        if not part.exists():return False
        try:
            meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames','-of','json',str(part)]))
            return int(meta['streams'][0]['nb_frames'])==n1-n0 and log.exists() and 'BROWSER LOG:' not in log.read_text()
        except Exception:return False
    if valid():
        print(f'Part {i+1}: already complete',flush=True)
        continue
    print(f'Part {i+1}: {n0/FPS:.2f}–{n1/FPS:.2f}s',flush=True)
    args=['bun','scripts/render.ts','video','--lang','ru','--from',str(n0/FPS),'--to',str(n1/FPS),'--fps',str(FPS),'--samples','12','--shutter','0.5','--crf','16','--noaudio','--out',str(part)]
    with log.open('w') as f:
        subprocess.run(args,cwd=ROOT/'app',env=env,stdout=f,stderr=subprocess.STDOUT,check=True)
    if not valid():raise RuntimeError(f'Part {i+1} failed frame-count or browser-log validation')
    print(f'Part {i+1}: complete ({time.time()-start:.0f}s elapsed)',flush=True)
concat=OUT/'concat.txt'
concat.write_text(''.join(f"file '{p.name}'\n" for p in parts))
final=ROOT/'out/ru/pdoom-ru-v2.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(concat),'-i',str(ROOT/'audio/pdoom-ru-v2.m4a'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-t',str(TOTAL/FPS),'-movflags','+faststart',str(final)],check=True)
print(f'Complete: {final} ({time.time()-start:.0f}s elapsed)',flush=True)
