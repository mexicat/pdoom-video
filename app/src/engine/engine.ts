// The engine: owns the renderer, loads scenes for the timeline, renders any song time
// deterministically (with preroll for stateful scenes), composites transitions, HUD, post.
import * as THREE from 'three';
import { AudioData } from './audio';
import { Lyrics } from './lyrics';
import { Compositor, FSPass, W, H, PW, PH, makeRT, clearRT } from './gl';
import { DEFAULT_POST, Post, type PostParams } from './post';
import { Hud, PDoom, type Caption } from './hud';
import type { Frame, Scene, SceneClass, SceneCtx, PostOverrides } from './scene';
import { loadFonts } from './type';
import { loadStrokeFonts } from './stroke';

export interface TimelineEntry {
  id: string;
  /** Lazy module loader; the module's default export is the Scene class. */
  load: () => Promise<{ default: SceneClass }>;
  start: number;
  end: number;
  /** Plate caption shown bottom-right at the start of this entry. */
  caption?: { fig: string; text: string; dur?: number; delay?: number };
  /** Default post overrides for this entry (the scene's own overrides win). */
  post?: PostOverrides;
  /** Free-form params handed to the scene as ctx.params. */
  params?: Record<string, any>;
}

interface Loaded { entry: TimelineEntry; scene: Scene | null; error?: string; lastT: number }

export class Engine {
  renderer: THREE.WebGLRenderer;
  ctx!: SceneCtx;
  audio!: AudioData;
  lyrics!: Lyrics;
  hud!: Hud;
  post!: Post;
  comp = new Compositor();
  loaded = new Map<string, Loaded>();
  private rts = [makeRT(), makeRT(), makeRT()];
  private mixRT = makeRT(W, H, { depthBuffer: false });
  private accRT = makeRT(W, H, { depthBuffer: false, type: THREE.FloatType });
  private finalRT = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.UnsignedByteType, depthBuffer: false });
  private blit: FSPass;
  private xfade: FSPass;
  private lastT = -1;
  lastPost: PostParams = { ...DEFAULT_POST };
  errors: string[] = [];
  /** Suppress the HUD (captions, crop marks) — used when rendering plate thumbnails. */
  hudOff = false;

  timeline: TimelineEntry[] = [];

  constructor(public canvas: HTMLCanvasElement, private makeTimeline: (lyrics: Lyrics, audio: AudioData) => TimelineEntry[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PW, PH, false);
    this.renderer.autoClear = false;
    this.blit = new FSPass(`uniform sampler2D src; void main(){ fragColor = texture(src, vUv); }`, { src: { value: null } });
    this.xfade = new FSPass(`uniform sampler2D a; uniform sampler2D b; uniform float k;
      void main(){ fragColor = mix(texture(a, vUv), texture(b, vUv), k); }`, { a: { value: null }, b: { value: null }, k: { value: 0 } });
  }

  async init(only?: (e: TimelineEntry) => boolean) {
    [this.audio, this.lyrics] = await Promise.all([AudioData.load(), Lyrics.load(), loadFonts(), loadStrokeFonts()]) as [AudioData, Lyrics, void, void];
    this.timeline = this.makeTimeline(this.lyrics, this.audio);
    this.ctx = { renderer: this.renderer, audio: this.audio, lyrics: this.lyrics, comp: this.comp, W, H, id: '', params: {}, start: 0, end: 0 };
    this.post = new Post();
    const captions: Caption[] = this.timeline.filter((e) => e.caption).map((e) => {
      const d = e.caption!.delay ?? 0.3;
      return { start: e.start + d, end: e.start + d + (e.caption!.dur ?? 4.5), fig: e.caption!.fig, text: e.caption!.text };
    });
    this.hud = new Hud(new PDoom(this.lyrics), captions);
    const entries = only ? this.timeline.filter(only) : this.timeline;
    await Promise.all(entries.map((e) => this.loadEntry(e)));
  }

  private async loadEntry(e: TimelineEntry) {
    const rec: Loaded = { entry: e, scene: null, lastT: -1 };
    this.loaded.set(e.id, rec);
    try {
      const mod = await e.load();
      const s = new mod.default({ ...this.ctx, id: e.id, params: e.params ?? {}, start: e.start, end: e.end });
      await s.init();
      rec.scene = s;
    } catch (err) {
      rec.error = String((err as Error)?.stack ?? err);
      this.errors.push(`[${e.id}] ${rec.error}`);
      console.error(`scene ${e.id} failed`, err);
    }
  }

  /** Hot-swap a scene module (used by Vite HMR in preview). */
  async reload(id: string) {
    const e = this.timeline.find((x) => x.id === id);
    if (!e) return;
    this.loaded.get(id)?.scene?.dispose();
    await this.loadEntry(e);
    this.lastT = -1;
  }

  get duration() { return this.audio.duration; }

  private frameFor(e: TimelineEntry, t: number, dt: number, seeked: boolean, preroll: boolean, under: THREE.Texture | null, tin: number, tout: number): Frame {
    const beat = this.audio.beatAt(t), bar = this.audio.barAt(t);
    return {
      t, dt, lt: t - e.start, p: (t - e.start) / (e.end - e.start), start: e.start, end: e.end, seeked, preroll,
      beat, bar, beatPhase: beat - Math.floor(beat), barPhase: bar - Math.floor(bar),
      a: this.audio.sample(t), under, tin, tout,
    };
  }

  /**
   * Render song time t. `dt` is the nominal frame step (1/fps). A non-sequential t counts as a
   * seek: stateful scenes are reset and fast-forwarded.
   * `samples` > 1 renders that many sub-frames spread over `shutter` × dt around t and averages
   * them before post-processing: real motion blur plus temporal anti-aliasing of fine lines
   * (offline export only; the preview uses 1).
   */
  render(t: number, dt = 1 / 60, toScreen = true, samples = 1, shutter = 0.5) {
    const r = this.renderer;
    let outTex: THREE.Texture;
    let post: PostParams;
    if (samples <= 1) {
      ({ outTex, post } = this.composite(t, dt));
    } else {
      clearRT(r, this.accRT, [0, 0, 0], 0);
      post = { ...DEFAULT_POST };
      for (let s = 0; s < samples; s++) {
        // (clamped at 0: before the song no scene is active, and frame 0 would come out half black)
        const ts = Math.max(0, t + dt * shutter * ((s + 0.5) / samples - 0.5));
        const res = this.composite(ts, dt / samples);
        this.comp.draw(r, res.outTex, this.accRT, { mode: 'add', opacity: 1 / samples, premult: false });
        if (s === Math.floor(samples / 2)) post = res.post;
      }
      outTex = this.accRT.texture;
    }
    const hudTex = this.hud.draw(t, { opacity: this.hudOff ? 0 : post.hud, frame: post.frame, readout: post.pdoom, paper: post.paper, pdoomOverride: post.pdoomText, corruption: post.hudCorruption });
    this.post.render(r, outTex, hudTex, this.finalRT, post, t);
    this.lastPost = post;
    if (toScreen) {
      this.blit.u.src!.value = this.finalRT.texture;
      this.blit.render(r, null);
    }
  }

  /** Render and composite all scenes active at t into an HDR texture (no post). */
  private composite(t: number, dtNominal: number): { outTex: THREE.Texture; post: PostParams } {
    const r = this.renderer;
    const seeked = this.lastT < 0 || t < this.lastT - 1e-6 || t - this.lastT > Math.max(0.25, dtNominal * 4);
    // actual step since the previous composite (sub-frames are unevenly spaced)
    const dt = seeked ? dtNominal : Math.max(1e-4, t - this.lastT);
    this.lastT = t;

    const active = this.timeline.filter((e) => t >= e.start && t < e.end).sort((a, b) => a.start - b.start);
    let post: PostParams = { ...DEFAULT_POST };
    let under: THREE.Texture | null = null;
    let outTex: THREE.Texture | null = null;

    active.forEach((e, idx) => {
      const rec = this.loaded.get(e.id);
      const rt = this.rts[idx % this.rts.length]!;
      const prev = active[idx - 1], next = active[idx + 1];
      const tin = prev ? Math.min(1, (t - e.start) / Math.max(1e-3, prev.end - e.start)) : 1;
      const tout = next ? Math.max(0, (t - next.start) / Math.max(1e-3, e.end - next.start)) : 0;
      if (!rec?.scene) {
        clearRT(r, rt, [0.25, 0.0, 0.0]);
        under = rt.texture; outTex = rt.texture;
        return;
      }
      const s = rec.scene;
      const sceneSeeked = seeked || rec.lastT < 0 || t < rec.lastT - 1e-6 || t - rec.lastT > 0.25;
      if (s.stateful && sceneSeeked) {
        s.reset();
        const from = Math.max(e.start, t - s.prerollMax);
        const step = 1 / 60;
        let first = true;
        for (let pt = from; pt < t - step * 0.5; pt += step) {
          s.render(this.frameFor(e, pt, first ? 0 : step, first, true, null, 1, 0), rt);
          first = false;
        }
      }
      let ov: PostOverrides | void = undefined;
      try {
        ov = s.render(this.frameFor(e, t, sceneSeeked ? 0 : dt, sceneSeeked && !s.stateful, false, idx > 0 ? under : null, tin, tout), rt);
      } catch (err) {
        console.error(`scene ${e.id} render error`, err);
        clearRT(r, rt, [0.25, 0.0, 0.0]);
      }
      rec.lastT = t;
      post = { ...post, ...(e.post ?? {}), ...(ov ?? {}) };
      if (idx > 0 && !s.handlesTransition && under) {
        // default: crossfade from the previous scene over the overlap
        this.xfade.u.a!.value = under;
        this.xfade.u.b!.value = rt.texture;
        this.xfade.u.k!.value = tin;
        this.xfade.render(r, this.mixRT);
        outTex = this.mixRT.texture;
      } else outTex = rt.texture;
      under = outTex;
    });

    if (!outTex) { clearRT(r, this.rts[0]!, [0, 0, 0]); outTex = this.rts[0]!.texture; }
    return { outTex, post };
  }

  /** RGBA8 pixels of the last rendered frame (bottom-up rows), PW x PH. */
  readPixels(buf?: Uint8Array) {
    const out = buf ?? new Uint8Array(PW * PH * 4);
    this.renderer.readRenderTargetPixels(this.finalRT, 0, 0, PW, PH, out);
    return out;
  }

  /**
   * Same pixels as readPixels(), read through a pixel-pack buffer and a fence instead of a blocking
   * readPixels: several times faster in Chrome (~15 ms instead of ~40 ms at 1080p, ~150 ms at 4K).
   */
  async readPixelsAsync(buf?: Uint8Array) {
    const out = buf ?? new Uint8Array(PW * PH * 4);
    await this.renderer.readRenderTargetPixelsAsync(this.finalRT, 0, 0, PW, PH, out);
    return out;
  }
}
