// Output resolution multiplier, read once from the page URL (`?scale=2` renders 3840x2160).
// Scenes keep laying out in logical 1920x1080 px; the engine renders at SCALE x that.
// Kept in its own module so glsl/common.ts can use it without an import cycle through gl.ts.
function readScale() {
  if (typeof location === 'undefined') return 1;
  const s = Math.round(Number(new URLSearchParams(location.search).get('scale') ?? '1'));
  return Number.isFinite(s) && s >= 1 ? Math.min(s, 4) : 1;
}

/** Physical pixels per logical pixel of the output (integer 1..4, default 1). */
export const SCALE = readScale();
