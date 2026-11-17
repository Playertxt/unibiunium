// The renderer uses a logarithmic depth buffer so distant water and terrain don't z-fight from high altitude.
// polygonOffset has no effect on shader-written depth, so flat overlays (runways, markings, craters) pull
// themselves toward the camera here instead. `levels` orders stacked overlays: higher draws on top.
export function depthBias(mat, levels = 1) {
  const k = (1 - levels * 6e-6).toFixed(8);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <logdepthbuf_vertex>',
      `#include <logdepthbuf_vertex>\n#ifdef USE_LOGDEPTHBUF_EXT\n  vFragDepth *= ${k};\n#endif`);
  };
  mat.customProgramCacheKey = () => `depthBias${levels}`;
  return mat;
}
