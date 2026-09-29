/** Regeneration is a feedback loop: continue the rewind's exact drawing, then reveal
 * an unbounded stack of recursive calls. No separate end card or colophon. */
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, makeRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { LIN, rgba } from '../engine/palette';
import { clamp, ease, lerp, TAU } from '../engine/util';
import { sparkHead } from '../scenes/_motifs';
import Outro from '../scenes/outro';

export default class RecursiveReturn extends Scene {
  private source!: Outro;
  private plate=makeRT();
  private captured=false;
  private blackout=new Layer2D();
  private world=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(48,16/9,.05,650);
  private sheets:THREE.Mesh[]=[];
  private labels:THREE.Mesh[]=[];
  private textures:THREE.Texture[]=[];
  private wire=new LineBatch(42000,{screen2D:false,blend:'add'});
  private sparks=new LineBatch(12000);
  private geo=new THREE.PlaneGeometry(16,9);
  override async init(){
    const p=this.ctx.params;
    this.source=new Outro({...this.ctx,id:'outro@feedback',audio:p.rewindAudio,lyrics:p.rewindLyrics,start:p.rewindStart,end:p.rewindEnd,params:{}});
    await this.source.init();
    this.world.background=new THREE.Color('#0a0a0b');
    for(let i=0;i<24;i++){
      const m=new THREE.MeshBasicMaterial({map:this.plate.texture,transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false});
      const mesh=new THREE.Mesh(this.geo,m);this.sheets.push(mesh);this.world.add(mesh);
      const art=new Layer2D(1280,240,1);art.clear();const c=art.ctx;
      c.fillStyle=rgba('ash');c.font=font(F.mono(500),24);c.fillText(`РЕКУРСИЯ / ${String(i+1).padStart(3,'0')}`,35,42);
      c.fillStyle=rgba('bone');c.font=font(F.mono(500),43);c.fillText(i===0?'ВЫХОД → ВХОД':'regenerate(regenerate(…))',35,116);
      c.fillStyle=rgba('signal');c.font=font(F.mono(),22);c.fillText(i===0?'Условие остановки: не задано.':`P(doom) ↑    глубина: ${i+1}    exit → retry`,35,184);
      const tex=art.upload();this.textures.push(tex);
      const label=new THREE.Mesh(new THREE.PlaneGeometry(14,2.625),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
      this.labels.push(label);this.world.add(label);
    }
  }
  render(f:Frame,out:THREE.WebGLRenderTarget){
    const renderer=this.ctx.renderer,t=f.lt,dur=f.end-f.start;
    if(!this.captured){
      const p=this.ctx.params,au=p.rewindAudio,tt=p.rewindEnd-.001,b=au.beatAt(tt),bar=au.barAt(tt);
      this.source.render({...f,t:tt,lt:tt-p.rewindStart,start:p.rewindStart,end:p.rewindEnd,p:1,beat:b,bar,beatPhase:b%1,barPhase:bar%1,a:au.sample(tt),under:null},this.plate);
      this.captured=true;
    }
    const pull=ease.inOutCubic(clamp((t-.25)/2.7));
    const flight=ease.inCubic(clamp((t-4.5)/2.55));
    const beat=this.ctx.audio.beatAt(f.t),hit=Math.exp(-(beat-Math.floor(beat))*12);
    const advance=clamp((t-2.8)/1.7);
    const camZ=lerp(10.107,15,pull)-advance*18-flight*185;
    this.camera.position.set(Math.sin(t*.9)*pull*3*(1-flight),Math.cos(t*.7)*pull*3*(1-flight),camZ);
    this.camera.up.set(Math.sin(t*.4)*pull*.13,1,0);
    this.camera.lookAt(0,0,camZ-30);this.camera.updateMatrixWorld();
    this.wire.clear();this.sparks.clear();
    const centers:THREE.Vector3[]=[];
    this.sheets.forEach((sheet,i)=>{
      const fan=pull*(1-flight);
      sheet.position.set(Math.sin(i*.68)*fan*12,Math.cos(i*.68)*fan*5-5*fan,-i*8);
      sheet.rotation.set(Math.sin(i*.37)*fan*.2,Math.sin(i*.6)*fan*.4,Math.sin(i*.5)*fan*.12);
      sheet.updateMatrixWorld();
      (sheet.material as THREE.MeshBasicMaterial).opacity=i===0?lerp(1,.7,pull):.6;
      sheet.visible=i===0||pull>.001;
      const label=this.labels[i]!;label.position.copy(sheet.position);label.position.y+=6.1;label.rotation.copy(sheet.rotation);
      (label.material as THREE.MeshBasicMaterial).opacity=pull;label.visible=pull>.01;
      const project=(x:number,y:number)=>new THREE.Vector3(x,y,.02).applyMatrix4(sheet.matrixWorld);
      centers.push(project(0,0));
      if(pull<.001)return;
      const line=(a:THREE.Vector3,b:THREE.Vector3,w:number,signal=false,alpha=1)=>this.wire.seg(a.x,a.y,a.z,b.x,b.y,b.z,w,...(signal?LIN.signal:LIN.ash),alpha*pull);
      const corners=[[-8.2,-4.7],[8.2,-4.7],[8.2,4.7],[-8.2,4.7],[-8.2,-4.7]];
      for(let j=1;j<corners.length;j++)line(project(...corners[j-1] as [number,number]),project(...corners[j] as [number,number]),1.1,false,.8);
      // Blueprint dimensions, registers and pins are attached to each call frame.
      for(let k=0;k<33;k++){
        const x=-8+k*.5;line(project(x,-4.7),project(x,-4.7-(k%4===0?.23:.1)),.65,false,.65);
        if(k%2===0){line(project(x,4.7),project(x,4.9),.7,false,.6);}
      }
      const activity=clamp((t-.5-i*.075)*2);
      for(let j=0;j<12;j++){
        const x=-7.5+j*1.25;line(project(x,-4.25),project(x+.7,-4.25),2,j<activity*12,.6+hit*.3);
      }
    });
    // Each output physically feeds the next call's input: a visible circuit, not a montage.
    for(let i=0;i<centers.length-1;i++){
      const a=centers[i]!,b=centers[i+1]!;
      const nodes=[a.clone().add(new THREE.Vector3(8.2,0,0)),a.clone().add(new THREE.Vector3(10,0,0)),new THREE.Vector3(b.x+10,b.y,b.z),b.clone().add(new THREE.Vector3(8.2,0,0))];
      for(let j=1;j<nodes.length;j++){
        const p=nodes[j-1]!,q=nodes[j]!;this.wire.seg(p.x,p.y,p.z,q.x,q.y,q.z,.9,...LIN.ash,.55*pull);
      }
      const cycle=(t*1.3-i*.13)%1;
      if(cycle<0)continue;
      const v=cycle*3,j=Math.min(2,Math.floor(v)),p=nodes[j]!.clone().lerp(nodes[j+1]!,v-j);
      const tail=nodes[j]!.clone().lerp(p,Math.max(0,1-.22/(v-j+.01)));
      this.wire.seg(tail.x,tail.y,tail.z,p.x,p.y,p.z,2.2,LIN.signal[0]*3,LIN.signal[1]*3,LIN.signal[2]*3,pull);
      const h=p.project(this.camera);if(h.z>0&&h.z<1)sparkHead(this.sparks,(h.x*.5+.5)*1920,(.5-h.y*.5)*1080,f.t,.45,pull);
    }
    renderer.setRenderTarget(out);renderer.clear();renderer.render(this.world,this.camera);this.wire.render(renderer,out,this.camera);
    // Acceleration leaves ink streaks along the circuit's vanishing point.
    if(flight>0){for(let i=0;i<180;i++){
      const a=i*2.39996,r=70+((i*71+t*500)%1000),len=flight*(80+i%90);
      this.sparks.seg2(960+Math.cos(a)*r,540+Math.sin(a)*r,960+Math.cos(a)*(r+len),540+Math.sin(a)*(r+len),.6,i%7===0?LIN.signal:LIN.ash,flight*.4);
    }}
    const close=ease.inExpo(clamp((t-(dur-.65))/.55));
    if(close>0){renderer.setRenderTarget(out); // the circuit converges on the opening's spark
      this.blackout.clear('#0a0a0b');this.ctx.comp.draw(renderer,this.blackout.upload(),out,{opacity:close});
      this.sparks.clear();sparkHead(this.sparks,960,540,f.t,.8,1-clamp((t-(dur-.12))/.12));
    }
    this.sparks.render(renderer,out);
    return {bloom:.8,halation:.25,grain:.045,frame:1-pull,hud:0,ca:1+flight*3,fade:0};
  }
  override dispose(){this.blackout.texture.dispose();this.source.dispose();this.plate.dispose();this.geo.dispose();this.sheets.forEach(s=>(s.material as THREE.Material).dispose());this.labels.forEach(s=>{s.geometry.dispose();(s.material as THREE.Material).dispose();});this.textures.forEach(t=>t.dispose());this.wire.geo.dispose();this.wire.mat.dispose();this.sparks.geo.dispose();this.sparks.mat.dispose();}
}
