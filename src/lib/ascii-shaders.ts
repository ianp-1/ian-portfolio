import { ATLAS_SPEC } from "./ascii-atlas";

export type { HeroAsciiHandle, HeroAsciiOptions } from "./ascii-engine";

export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 pos;
  if (gl_VertexID == 0) {
    pos = vec2(-1.0, -1.0);
  } else if (gl_VertexID == 1) {
    pos = vec2(3.0, -1.0);
  } else {
    pos = vec2(-1.0, 3.0);
  }
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

/**
 * Pass 2 ASCII Compositor Fragment Shader.
 * Samples the 96x54 RGBA8 Navier-Stokes fluid texture:
 *  - R: advected ink density
 *  - G: accent excitation (rim energy + directional wake)
 *  - B: packed horizontal fluid velocity (128/255 = 0)
 *  - A: packed vertical fluid velocity (128/255 = 0, +Y = up in GL UV space)
 * Runs 3x3 Sobel edge detection + velocity-aligned shard selection from the
 * Geist Mono atlas, feathering cleanly around uClearRect.
 */
export const PASS2_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uFluidTex;
uniform sampler2D uAtlasTex;
uniform vec2 uGridSize;
uniform vec2 uFluidTexel;
uniform vec2 uAtlasDims;
uniform float uAspect;
uniform vec3 uPaperColor;
uniform vec3 uInkColor;
uniform vec3 uMutedColor;
uniform vec3 uAccentColor;
uniform vec3 uAccentSecondaryColor;
uniform vec4 uClearRect;
uniform float uHasClearRect;
uniform float uScrollDissolve;

const float PI = 3.14159265359;

float sampleInk(vec2 uv) {
  return texture(uFluidTex, clamp(uv, 0.001, 0.999)).r;
}

float angleToEdgeGlyph(float angle) {
  // Edge ramp order: 0:'|', 1:'/', 2:'-', 3:'\\'
  if (angle < PI * 0.125 || angle >= PI * 0.875) {
    return 0.0; // '|'
  } else if (angle < PI * 0.375) {
    return 3.0; // '\\'
  } else if (angle < PI * 0.625) {
    return 2.0; // '-'
  }
  return 1.0; // '/'
}

float angleToVelocityShardGlyph(float angle) {
  // Velocity vector tangent alignment:
  // 0 rad -> horizontal '-', PI/4 -> '/', PI/2 -> '|', 3*PI/4 -> '\\'
  if (angle < PI * 0.125 || angle >= PI * 0.875) {
    return 2.0; // '-'
  } else if (angle < PI * 0.375) {
    return 1.0; // '/'
  } else if (angle < PI * 0.625) {
    return 0.0; // '|'
  }
  return 3.0; // '\\'
}

void main() {
  vec2 cellIdx = floor(vUv * uGridSize);
  vec2 cellCenterUv = (cellIdx + 0.5) / uGridSize;
  vec2 cellUv = fract(vUv * uGridSize);

  vec4 center = texture(uFluidTex, clamp(cellCenterUv, 0.001, 0.999));

  // 3x3 Sobel gradient edge detection on advected fluid ink
  vec2 stepUv = max(uFluidTexel, 0.72 / uGridSize);
  float tl = sampleInk(cellCenterUv + vec2(-stepUv.x, stepUv.y));
  float tc = sampleInk(cellCenterUv + vec2(0.0, stepUv.y));
  float tr = sampleInk(cellCenterUv + vec2(stepUv.x, stepUv.y));
  float ml = sampleInk(cellCenterUv + vec2(-stepUv.x, 0.0));
  float mr = sampleInk(cellCenterUv + vec2(stepUv.x, 0.0));
  float bl = sampleInk(cellCenterUv + vec2(-stepUv.x, -stepUv.y));
  float bc = sampleInk(cellCenterUv + vec2(0.0, -stepUv.y));
  float br = sampleInk(cellCenterUv + vec2(stepUv.x, -stepUv.y));

  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float edgeMag = length(vec2(gx, gy));

  vec2 vel = (center.ba - vec2(128.0 / 255.0)) * (255.0 / 127.0);
  float speed = length(vel);

  // Smooth negative-space feather around lower horizon CTA & dock
  float clearMask = 1.0;
  if (uHasClearRect > 0.5) {
    vec2 rectCenter = 0.5 * (uClearRect.xy + uClearRect.zw);
    vec2 rectHalf = max(vec2(0.001), 0.5 * (uClearRect.zw - uClearRect.xy));
    vec2 d = abs(cellCenterUv - rectCenter) - rectHalf;
    d.x *= uAspect;
    float boxDist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    clearMask = smoothstep(-0.005, 0.055, boxDist);
  }

  float ink = clamp(center.r * clearMask, 0.0, 1.0);
  float acc = clamp(center.g * clearMask, 0.0, 1.0);
  float lum = clamp(ink + acc * 0.14, 0.0, 1.0);

  float atlasRow = float(${ATLAS_SPEC.rowAscii});
  float glyphIdx = 0.0;

  float count = float(${ATLAS_SPEC.asciiRamp.length});
  bool activeVelocityShard =
    speed > 0.14 && acc > 0.24 && ink > 0.09 && ink < 0.85 && clearMask > 0.35;
  bool activeSobelEdge =
    edgeMag * clearMask > 0.58 && ink > 0.24 && ink < 0.68 && clearMask > 0.35;

  if (activeVelocityShard) {
    atlasRow = float(${ATLAS_SPEC.rowEdge});
    float vAngle = mod(atan(vel.y, vel.x), PI);
    glyphIdx = angleToVelocityShardGlyph(vAngle);
  } else if (activeSobelEdge) {
    atlasRow = float(${ATLAS_SPEC.rowEdge});
    float eAngle = mod(atan(gy, gx), PI);
    glyphIdx = angleToEdgeGlyph(eAngle);
  } else {
    atlasRow = float(${ATLAS_SPEC.rowAscii});
    glyphIdx = floor(clamp(lum, 0.0, 0.999) * count);
  }

  vec2 insetCellUv = clamp(cellUv, 0.03, 0.97);
  vec2 atlasUv = vec2(
    (glyphIdx + insetCellUv.x) / uAtlasDims.x,
    (atlasRow + (1.0 - insetCellUv.y)) / uAtlasDims.y
  );

  float glyphAlpha = texture(uAtlasTex, atlasUv).a;

  // Pure monochrome luminance progression:
  // muted ambient field -> sharp ink letterforms -> bright monochrome accent highlights on fluid wake
  vec3 baseColor = mix(uMutedColor, uInkColor, smoothstep(0.24, 0.68, ink));
  float secMix = clamp(speed * 0.42, 0.0, 0.55) * (1.0 - smoothstep(0.55, 0.95, ink));
  vec3 fieldColor = mix(baseColor, uAccentSecondaryColor, secMix);
  float primaryMix = smoothstep(0.22, 0.72, acc);
  vec3 glyphColor = mix(fieldColor, uAccentColor, primaryMix);

  float stayMask = 1.0;
  if (uScrollDissolve > 0.001) {
    float cellHash = fract(sin(cellIdx.x * 12.9898 + cellIdx.y * 78.233) * 43758.5453);
    float peelOrder = clamp((cellCenterUv.y - 0.22) * 0.92 + cellHash * 0.34, 0.02, 0.94);
    stayMask = 1.0 - smoothstep(peelOrder - 0.05, peelOrder + 0.04, uScrollDissolve);
  }

  float visibility = clearMask * smoothstep(0.085, 0.24, max(ink, acc * 0.48)) * stayMask;
  vec3 outRgb = mix(uPaperColor, glyphColor, glyphAlpha * visibility);

  fragColor = vec4(outRgb, 1.0);
}
`;
