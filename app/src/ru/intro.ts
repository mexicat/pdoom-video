/** Ignition → fly-through → diagnostic warning → console reveal.
 * Credits are annotations on the action. All motion derives from the recording's beat grid.
 */
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font, layout } from '../engine/type';
import { LIN, rgba } from '../engine/palette';
import { clamp, ease, hash, lerp, TAU } from '../engine/util';
import { sparkHead, sparkParticles } from '../scenes/_motifs';

export default class RussianIgnition extends Scene {
  private world=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(48,16/9,.03,140);
  private machine=new THREE.Group();
  private rings:THREE.Group[]=[];
  private tunnel=new THREE.Group();
  private frames:THREE.Group[]=[];
  private wires=new LineBatch(24000,{screen2D:false,blend:'add'});
  private sparks=new LineBatch(12000);
  private ui=new Layer2D();
  private materials:THREE.Material[]=[];
  private geometries:THREE.BufferGeometry[]=[];
  private creditGroups:THREE.Group[]=[];
  private creditTextures:THREE.Texture[]=[];
  private shotBeat=0;
  private material(o:THREE.MeshStandardMaterialParameters){const m=new THREE.MeshStandardMaterial(o);this.materials.push(m);return m;}
  private geo<T extends THREE.BufferGeometry>(g:T):T{this.geometries.push(g);return g;}
  override init(){
    this.world.background=new THREE.Color('#0a0a0b');
    this.world.fog=new THREE.FogExp2('#0a0a0b',.027);
    this.world.add(this.machine,this.tunnel);
    this.world.add(new THREE.AmbientLight('#c9bcaa',.5));
    for(const [color,power,x,y,z] of [['#fff0d9',2.2,-4,7,8],['#ff4d12',2.0,6,-3,4],['#eee9df',1.5,0,2,-8]] as const){
      const l=new THREE.DirectionalLight(color,power);l.position.set(x,y,z);this.world.add(l);
    }
    const metal=this.material({color:'#5e5b57',metalness:.72,roughness:.26});
    const ceramic=this.material({color:'#797a7c',metalness:.3,roughness:.4});
    const hot=this.material({color:'#ff4d12',emissive:'#ff4d12',emissiveIntensity:.85,metalness:.3,roughness:.3});
    const tooth=this.geo(new THREE.BoxGeometry(.065,.21,.13));
    const panel=this.geo(new THREE.BoxGeometry(.46,.13,.09));
    for(let j=0;j<9;j++){
      const g=new THREE.Group(),r=.7+j*.28;
      const ring=new THREE.Mesh(this.geo(new THREE.TorusGeometry(r,.035+j*.003,8,144)),j%3===0?hot:metal);g.add(ring);
      for(let k=0;k<48;k++){
        const a=k/48*TAU;
        const m=new THREE.Mesh(k%4?tooth:panel,k%12===0?hot:ceramic);
        m.position.set(Math.cos(a)*r,Math.sin(a)*r,0);m.rotation.z=a-Math.PI/2;g.add(m);
      }
      this.machine.add(g);this.rings.push(g);
    }
    const rail=this.geo(new THREE.BoxGeometry(.03,.03,2));
    for(let j=0;j<22;j++){
      const g=new THREE.Group();
      const s=2.3+j*.025;
      for(let k=0;k<4;k++){
        const m=new THREE.Mesh(this.geo(new THREE.BoxGeometry(k%2?.018:s*2,k%2?s*2:.018,.035)),j%4===0?hot:metal);
        m.position.set(k%2?(k===1?s:-s):0,k%2?0:(k===0?s:-s),0);g.add(m);
        const screw=new THREE.Mesh(rail,ceramic);screw.position.set(k<2?s:-s,k%2?s:-s,.6);g.add(screw);
      }
      this.frames.push(g);this.tunnel.add(g);
    }
    // World-space drafting callouts share the mechanism’s camera and leader geometry.
    const makePlate=(role:string,name:string,w:number,h:number)=>{
      const group=new THREE.Group();
      const art=new Layer2D(1280,360,1),cc=art.ctx;art.clear();cc.fillStyle='rgba(10,10,11,.82)';cc.fillRect(0,0,1280,360);
      cc.strokeStyle='#9c978f';cc.lineWidth=2;cc.beginPath();cc.moveTo(32,310);cc.lineTo(1248,310);cc.stroke();
      cc.fillStyle='#9c978f';cc.font=font(F.mono(500),35);cc.fillText(role,72,93);
      cc.fillStyle='#eee9df';const fam=F.archivo(87.5,700);
      const fs=Math.min(133,1120/layout(name,fam,1).width);cc.font=font(fam,fs);cc.fillText(name,66,249);
      cc.fillStyle='#c43b10';cc.fillRect(72,285,150,7);
      const texture=art.upload();texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.anisotropy=8;this.creditTextures.push(texture);
      const ink=new THREE.MeshBasicMaterial({map:texture,color:'#eee9df',transparent:true,depthWrite:false});this.materials.push(ink);
      const face=new THREE.Mesh(this.geo(new THREE.PlaneGeometry(w,h)),ink);group.add(face);
      group.userData={labelWidth:w,labelHeight:h};
      return group;
    };
    const personal=new THREE.Group();personal.add(makePlate('РУССКИЙ ТЕКСТ / АДАПТАЦИЯ','Azarattum',3.7,1.04));
    const creators=new THREE.Group();
    [['ВИДЕО','mexicat'],['ТЕКСТ','osmarks & MusicPerson'],['ПЕСНЯ / CLAUDE-POP','deckard (@slimer48484)']].forEach(([role,name],i)=>{
      const plate=makePlate(role!,name!,3.0,.86);plate.position.x=(i-1)*3.23;plate.rotation.y=(i-1)*-.055;creators.add(plate);
    });
    const models=new THREE.Group();
    [['РЕНДЕР','GPT 6 Astra'],['ВОКАЛЬНЫЙ КАВЕР','Suno v6'],['ОРИГИНАЛЬНОЕ ВИДЕО','Claude Opus 5.5']].forEach(([role,name],i)=>{
      const plate=makePlate(role!,name!,2.45,.7);plate.position.x=(i-1)*2.66;models.add(plate);
    });
    this.creditGroups=[personal,creators,models];this.world.add(...this.creditGroups);
  }

  private text(c:CanvasRenderingContext2D,s:string,x:number,y:number,size:number,family=F.mono(),color=rgba('bone')){
    c.font=font(family,size);c.fillStyle=color;c.fillText(s,x,y);
  }
  private pathPoint(t:number){return {x:960+Math.cos(t*2.7)*380,y:540+Math.sin(t*3.1)*200};}
  render(f:Frame,out:THREE.WebGLRenderTarget){
    if(this.ctx.audio.beatAt(f.t)>=22)return this.blueprintTitle(f,out);
    const t=f.lt, beat=this.ctx.audio.beatAt(f.t), b=Math.max(0,beat), phase=b-Math.floor(b);
    const hit=Math.exp(-phase*12), accent=Math.max(hit*.6,f.a.kick*.8,f.a.snare*.5);
    const B=(v:number)=>this.ctx.audio.timeOfBeat(v);
    const beatStep=(v:number)=>Math.floor(v)+ease.outExpo(clamp((v%1)/.34));
    const fly=clamp((b-8)/8), overload=clamp((b-16)/6), titleIn=clamp((b-22)/2);
    this.shotBeat=b;
    this.machine.visible=b<24;this.tunnel.visible=b<25;

    this.wires.clear();this.sparks.clear();this.ui.clear();
    const c=this.ui.ctx;
    // Macro opening: the machine assembles around the lens, not a fade up on a slide.
    const assemble=ease.outExpo(clamp((t+.09)/.65));
    this.machine.scale.setScalar(assemble*(1+.055*accent));
    this.machine.rotation.set(.14+Math.sin(b*.22)*.18,b<8?.18+beatStep(b/4)*.27:fly*.8,beatStep(b/2)*.21);
    this.machine.position.z=b<16?0:-5;
    this.rings.forEach((g,j)=>{
      const spread=(1-assemble)*9+Math.pow(overload,2)*j*.13;
      g.position.z=(j-4)*(.15+spread);
      g.rotation.set(Math.sin(j*1.2+b*.23)*(.28+overload*.6),Math.cos(j*.8+b*.17)*(.2+overload*.9),b*(j%2?-.09:.07)+j*.19);
      g.scale.setScalar(1+accent*.018*(j%3));
    });
    this.frames.forEach((g,j)=>{
      const travel=b<8?0:(b-8)*1.3;
      g.position.z=-3-((j*1.6-travel+100)%35.2);
      g.rotation.z=(j*.105)+beatStep(b/4)*.24+overload*.7;
      g.scale.setScalar(1+.08*Math.sin(j+b*.2));
    });
    if(b<8){
      const d=lerp(3.3,7.8,ease.outExpo(clamp(b/3))) - .45*beatStep((b%4)/4);
      this.camera.position.set(Math.sin(b*.35)*1.3,Math.cos(b*.23)*.8,d-accent*.18);
      this.camera.up.set(Math.sin(b*.11)*.3,1,0);this.camera.lookAt(0,0,0);
    }else if(b<16){
      const turn=beatStep((b-8)/2)*.28;
      this.camera.position.set(Math.sin(turn)*.13,Math.cos(turn)*.06,lerp(4,-6,ease.outCubic(fly)));
      this.camera.up.set(Math.sin(turn)*.12,1,0);this.camera.lookAt(0,0,-24);
    }else if(b<22){
      const a=(b-16)*.32;
      this.camera.position.set(Math.sin(a*.3)*1.3,Math.cos(a)*.35,7-overload);
      this.camera.up.set(Math.sin(a*.25)*.14,1,0);this.camera.lookAt(0,0,-5);
    }else{
      const reveal=ease.inOutCubic(clamp((b-25)/6));
      this.camera.position.set(lerp(2.6,.25,reveal),lerp(1.15,.22,reveal),lerp(12,10.2,reveal));
      this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);
    }
    this.creditGroups.forEach((g,i)=>g.visible=i===0?b<8:i===1?b>=8&&b<16:b>=16&&b<24.2);
    const personal=this.creditGroups[0]!,creators=this.creditGroups[1]!,models=this.creditGroups[2]!;
    personal.position.set(-1.3,-.9,3.0);personal.scale.setScalar(.7);personal.rotation.set(.04,.06,-.025);
    // Drafting annotations travel with the camera through the machine.
    // Their stable orientation provides a reading hold while the camera advances.
    creators.position.set(.1,-1.4,this.camera.position.z-6);creators.scale.setScalar(.65);creators.rotation.set(.04,0,.012*Math.sin(b));
    models.position.set(.1,-2.32,-.5);models.rotation.set(.025,0,0);
    this.camera.updateMatrixWorld();
    const renderer=this.ctx.renderer;
    renderer.setRenderTarget(out);renderer.setClearColor(new THREE.Color('#0a0a0b'),1);renderer.clear();renderer.render(this.world,this.camera);
    // Hundreds of etched perspective lines, radial calibration marks and ignition filaments.
    if(b<24){
      const lb=this.wires;
      for(let j=0;j<32;j++){
        const z=-j*.65-1, r=2.2+Math.sin(j*.3+b*.2)*.22;
        for(let i=0;i<96;i++){
          const a=i/96*TAU+b*.02,aa=a+TAU/96;
          const hot=j%8===Math.floor(b)%8;
          lb.seg(Math.cos(a)*r,Math.sin(a)*r,z,Math.cos(aa)*r,Math.sin(aa)*r,z,hot?1.5:.65,...(hot?LIN.signal:LIN.ash),hot?.75:.2);
        }
      }
      for(let i=0;i<96;i++){
        const a=i/96*TAU;
        lb.seg(Math.cos(a)*2.4,Math.sin(a)*2.4,-1,Math.cos(a+.7)*2.4,Math.sin(a+.7)*2.4,-24,.65,...LIN.ash,.22);
      }
      this.world.updateMatrixWorld(true);
      this.creditGroups.forEach((group,gi)=>{
        if(!group.visible)return;
        group.children.forEach((label,j)=>{
          const start=new THREE.Vector3(0,label.userData.labelHeight*.5,0).applyMatrix4(label.matrixWorld);
          const object=gi===1?this.frames[4+j*3]!:this.rings[Math.min(8,2+j*2)]!;
          const end=gi===1?new THREE.Vector3((j-1)*1.4,-(2.3+(4+j*3)*.025),0):new THREE.Vector3(Math.cos(j+2.3)*(.7+Math.min(8,2+j*2)*.28),Math.sin(j+2.3)*(.7+Math.min(8,2+j*2)*.28),0);
          end.applyMatrix4(object.matrixWorld);
          const elbow=new THREE.Vector3(start.x,start.y+.25,start.z);
          lb.seg(start.x,start.y,start.z,elbow.x,elbow.y,elbow.z,.9,...LIN.ash,.65);
          lb.seg(elbow.x,elbow.y,elbow.z,end.x,end.y,end.z,.9,...LIN.ash,.65);
          lb.seg(end.x-.025,end.y,end.z,end.x+.025,end.y,end.z,3,...LIN.signal,1);
        });
      });
      lb.render(renderer,out,this.camera);
      const lb2=this.sparks;
      // Projected sparks are carried by the actual rotating machine.
      const v=new THREE.Vector3();
      for(let i=0;i<120;i++){
        const a=i*2.39996+b*.15,r=3+hash(i,31)*3,age=(t*1.4+hash(i,32))%1;
        v.set(Math.cos(a)*r*age,Math.sin(a)*r*age,2-age*13).project(this.camera);
        if(v.z<0||v.z>1)continue;
        const x=(v.x*.5+.5)*1920,y=(.5-v.y*.5)*1080;
        lb2.seg2(x,y,x+(x-960)*.025,y+(y-540)*.025,1,LIN.signal,(1-age)*.65);
      }
      // Tiny scale labels and operators are part of the instrument, never a title block.
      c.save();c.translate(960,540);c.rotate(-.08+Math.sin(b*.14)*.08);
      if(b>=16&&b<22){
        this.text(c,'P(doom)',-185,-75,51,F.serif(400,true),rgba('bone',.8));
        const val=(.02+Math.floor((b-16)*2)*.01).toFixed(2);
        this.text(c,val,-240,100,160,F.mono(500),rgba('signal'));
        this.text(c,'КАЛИБРОВКА НЕ ПОМОГЛА',-195,154,21,F.mono(),rgba('ash'));
      }
      c.restore();
      this.text(c,`RU / 02    ${String(Math.floor(b)).padStart(2,'0')}`,112,124,19,F.mono(),rgba('ash',.65));
      // On the first hit an orange hairline shoots through the lens.
      if(t<.55){const q=ease.outExpo(clamp(t/.35));lb2.seg2(960-960*q,540,960+960*q,540,2,[3,.2,.01],1-q*.7);sparkHead(lb2,960,540,t,1.4*(1-q)+.3,2);}
    }
    this.ctx.comp.draw(renderer,this.ui.upload(),out);
    this.sparks.render(renderer,out);
    const titleHit=0;
    const cutHit=[8,16,22,25].reduce((v,k)=>Math.max(v,b>=k?Math.exp(-(b-k)*22):0),0);
    return {bloom:.7,halation:.3,grain:.045,frame:0,hud:0,ca:.8+accent*.7+titleHit*5,flash:Math.max(cutHit,titleHit)*.07,shake:[Math.sin(t*73)*titleHit*9,Math.cos(t*91)*titleHit*6] as [number,number]};
  }
  /** A translated diagnostic, first seen as a title, then revealed as one log entry.
   * The pen's position drives both cancellation and writing: no independent breakup cue.
   */
  private blueprintTitle(f:Frame,out:THREE.WebGLRenderTarget){
    const b=this.ctx.audio.beatAt(f.t),t=f.t,c=this.ui.ctx,lb=this.sparks;
    lb.clear();this.ui.clear('#0a0a0b');
    const reveal=ease.inOutCubic(clamp((b-29.1)/2.5));
    const z=lerp(1.65,.9,reveal),fx=lerp(765,960,reveal),fy=lerp(575,565,reveal);
    const exit=clamp((f.lt-(f.end-.40))/.40);
    const project=(x:number,y:number)=>({x:960+(x-fx)*z,y:540+(y-fy)*z});
    c.save();c.translate(960,540);c.scale(z,z);c.translate(-fx,-fy);
    // The title and the console are one drawing, with the same baseline and ink.
    c.strokeStyle=rgba('graphite',.2);c.lineWidth=.7/z;c.beginPath();
    for(let x=-1200;x<3400;x+=64){c.moveTo(x,-900);c.lineTo(x,2100);}
    for(let y=-900;y<2100;y+=64){c.moveTo(-1200,y);c.lineTo(3400,y);}c.stroke();
    c.strokeStyle=rgba('ash',.3);c.lineWidth=1/z;
    c.beginPath();c.rect(70,70,1780,930);c.moveTo(70,185);c.lineTo(1850,185);c.moveTo(310,185);c.lineTo(310,1000);c.stroke();
    // Drafting crosshairs and dimension extensions establish the shared paper surface.
    for(const [x,y] of [[70,70],[1850,70],[70,1000],[1850,1000]]){
      c.beginPath();c.moveTo(x!-18,y!);c.lineTo(x!+18,y!);c.moveTo(x!,y!-18);c.lineTo(x!,y!+18);c.stroke();
    }
    c.save();c.globalAlpha=reveal;
    this.text(c,'ДИАГНОСТИКА / РУССКОЕ ИЗДАНИЕ',115,145,31,F.mono(500));
    this.text(c,'RUN 02',1605,145,27,F.mono(),rgba('signal'));
    const prefix=(s:string,y:number)=>this.text(c,s,116,y,21,F.mono(),rgba('ash'));
    prefix('00:00.000',272);prefix('00:00.440',334);prefix('00:00.880',396);
    this.text(c,'init() → OK',350,272,29,F.mono());
    this.text(c,'locale: EN → RU',350,334,29,F.mono());
    this.text(c,'P(doom) = 0.02',350,396,29,F.mono(),rgba('signal'));
    prefix('ЗАМЕНЕНО',522);prefix('WARN',662);
    this.text(c,'¹ Смена языка не меняет прогноз.',350,765,25,F.mono(),rgba('ash'));
    this.text(c,'Продолжить?  [Д / Д]',350,868,31,F.mono(),rgba('bone'));
    this.text(c,'ЛОКАЛИЗАЦИЯ ЗАВЕРШЕНА / ОПАСНОСТЬ НЕ УСТРАНЕНА',114,1100,23,F.mono(),rgba('ash'));
    c.restore();
    const old="I'm Upping My P(doom)",fresh='Повышен риск конца';
    const fam=F.archivo(87.5,700),size=82,x0=350,oldY=522,newY=662;
    const ow=layout(old,fam,size).width,nw=layout(fresh,fam,size).width;
    // Baseline, cap-height and dimension marks remain visible during the close-up.
    c.strokeStyle=rgba('ash',.23);c.lineWidth=.8/z;
    for(const y of [oldY,newY]){
      c.beginPath();c.moveTo(x0-32,y);c.lineTo(x0+Math.max(ow,nw)+45,y);
      c.moveTo(x0-32,y-size*.72);c.lineTo(x0+Math.max(ow,nw)+45,y-size*.72);c.stroke();
    }
    this.text(c,old,x0,oldY,size,fam,rgba('bone',lerp(1,.38,clamp((b-24.5)/1.2))));
    const cancel=clamp((b-23.1)/1.3),headX=x0+ow*cancel,cutY=oldY-size*.31;
    if(cancel>0){
      c.strokeStyle=rgba('signal');c.lineWidth=2.3/z;c.beginPath();c.moveTo(x0-8,cutY);c.lineTo(headX,cutY);c.stroke();
      const a=project(x0-8,cutY),h=project(headX,cutY);
      lb.seg2(a.x,a.y,h.x,h.y,1.9,[2,.12,.004],1);
      if(cancel<1){
        sparkHead(lb,h.x,h.y,t,.9,1.4);
        sparkParticles(lb,t,tt=>{const q=clamp((this.ctx.audio.beatAt(tt)-23.1)/1.3);return q>0&&q<1?project(x0+ow*q,cutY):null;},{rate:160,speed:140,gravity:160,life:.28,seed:318});
      }
    }
    // The next output line is laid down by the same head. The ink only exists behind it.
    const write=clamp((b-24.7)/3.4),inkX=x0+nw*write;
    if(write>0){
      c.save();c.beginPath();c.rect(x0-5,newY-size,nw*write+5,size*1.35);c.clip();
      this.text(c,fresh,x0,newY,size,fam,rgba('signal'));c.restore();
      if(write<1){
        const h=project(inkX,newY-size*.34);sparkHead(lb,h.x,h.y,t,.75,1);
        // The pen carriage and its calibrated rail move with the actual writing edge.
        c.strokeStyle=rgba('bone',.6);c.lineWidth=1/z;c.beginPath();c.moveTo(inkX,newY-size-28);c.lineTo(inkX,newY+25);c.stroke();
        this.text(c,'RU',inkX+14,newY-size-32,15,F.mono(),rgba('ash'));
      }
    }
    // Small drawing notes are deliberately peripheral until the log is revealed.
    c.save();c.globalAlpha=1-reveal;
    this.text(c,'ВХОД / EN',x0,oldY-105,17,F.mono(),rgba('ash'));
    if(write>0)this.text(c,'ВЫХОД / RU',x0,newY+65,17,F.mono(),rgba('ash'));
    this.text(c,'Δ язык ≠ Δ риск',x0+Math.max(ow,nw)-250,newY+65,17,F.mono(),rgba('ash'));
    c.restore();
    // Both available answers are “yes”: the log proceeds to the original plotter.
    if(b>32){
      const go=clamp((b-32)/.5);
      const answerX=350+layout('Продолжить?  [',F.mono(),31).width;
      c.fillStyle=rgba('signal',go*.25);c.fillRect(answerX-4,830,27,47);
      this.text(c,'>',350,943,32,F.mono(),rgba('signal'));
      this.text(c,'render.start()',392,943,28,F.mono(),rgba('bone',go));
      if(Math.floor(t*7)%2===0){c.fillStyle=rgba('signal');c.fillRect(398+layout('render.start()',F.mono(),28).width,921,16,27);}
    }
    c.restore();
    const renderer=this.ctx.renderer;renderer.setRenderTarget(out);renderer.setClearColor(new THREE.Color('#0a0a0b'),1);renderer.clear();
    this.ctx.comp.draw(renderer,this.ui.upload(),out,{opacity:1-ease.inCubic(exit)});
    if(exit>0){
      const k=ease.outExpo(exit);
      lb.seg2(960-860*k,540,960+860*k,540,1.0,LIN.signal,.6);
      lb.seg2(960,540-410*k,960,540+410*k,.7,LIN.ash,.4);
      sparkHead(lb,960,540,t,.7,1);
    }
    lb.render(renderer,out);
    return {bloom:.65,halation:.23,grain:.045,hud:0,frame:0,ca:.6,flash:Math.exp(-Math.max(0,b-22)*24)*.035};
  }
  override dispose(){this.ui.texture.dispose();this.materials.forEach(m=>m.dispose());this.creditTextures.forEach(t=>t.dispose());this.geometries.forEach(g=>g.dispose());this.wires.geo.dispose();this.wires.mat.dispose();this.sparks.geo.dispose();this.sparks.mat.dispose();}
}
