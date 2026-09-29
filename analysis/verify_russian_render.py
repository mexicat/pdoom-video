"""Probe and fully decode the final original-scene Russian export."""
from pathlib import Path
import hashlib, json, subprocess
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'out/ru/pdoom-ru-v2.mp4'
meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
v=next(s for s in meta['streams'] if s['codec_type']=='video')
a=next(s for s in meta['streams'] if s['codec_type']=='audio')
duration=json.loads((ROOT/'data/ru/audio.json').read_text())['duration']
assert (v['width'],v['height'],v['r_frame_rate'],v['codec_name'])==(1920,1080,'60/1','h264')
assert int(v['nb_frames'])==round(duration*60)
assert (a['codec_name'],a['sample_rate'],a['channels'])==('aac','48000',2)
assert abs(float(v['duration'])-duration)<1/60
assert abs(float(a['duration'])-duration)<.05
result=subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(p),'-f','null','-'],capture_output=True,text=True)
(ROOT/'out/ru/v2/final-decode.log').write_text(result.stderr)
result.check_returncode()
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  while b:=f.read(1024*1024):h.update(b)
 return h.hexdigest()
manifest={'file':str(p.relative_to(ROOT)),'sha256':sha(p),'bytes':p.stat().st_size,'video':{'width':v['width'],'height':v['height'],'fps':60,'frames':int(v['nb_frames']),'duration':v['duration'],'codec':v['codec_name'],'temporal_samples':12,'shutter':.5,'crf':16},'audio':{'source':'audio/pdoom-ru-v2.m4a','source_sha256':sha(ROOT/'audio/pdoom-ru-v2.m4a'),'codec':a['codec_name'],'sample_rate':a['sample_rate'],'channels':a['channels'],'duration':a['duration']},'visuals':'22 original scene entries with updated word timing; new credits/title and appendix scenes','full_decode':'pass','branch':'russian-version'}
(ROOT/'out/ru/v2/render-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
