import {
  AdditiveBlending,
  DataTexture,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  type IUniform,
  type Texture,
} from 'three'

import type { Lighting, Rgb } from './tokens'

/**
 * The scene's materials. No real-time lights and no shadows: the light from
 * each ledge's LED bar, the glow it throws on the wall, the halo round each
 * box and the shine on the ledge are terms in these shaders, driven by the
 * page's lighting tokens and by one color per ledge (architecture, section 14).
 *
 * Everything is in sRGB, as CSS composites it: the renderer converts nothing.
 * three.js compiles every shader material as GLSL ES 3.0, so `in`, `flat` and
 * `texelFetch` are available, and `gl_FragColor` is its output.
 */

/** How many atlas pages of covers, and of generated spines, the box shader can read. */
export const COVER_PAGES = 4
export const SPINE_PAGES = 2

/** Shared by every material, so one change of light reaches the whole room. */
export type RoomUniforms = {
  uWall: IUniform<Rgb>
  uWallDeep: IUniform<Rgb>
  uLedge: IUniform<Rgb>
  uLedgeTop: IUniform<Rgb>
  uLine: IUniform<Rgb>
  uAmbient: IUniform<number>
  uLedStrength: IUniform<number>
  uLedWash: IUniform<number>
  uGlow: IUniform<number>
  uReflect: IUniform<number>
  uShadowDepth: IUniform<number>
  /** The wall behind a pulled box dims: 0 to 1. */
  uDim: IUniform<number>
  /** The switch to 2D flattens everything against the wall: 0 is full depth, 1 flat. */
  uFlat: IUniform<number>
  /** One LED color per ledge, as a row of texels. */
  uLedges: IUniform<DataTexture>
}

export const roomUniforms = (): RoomUniforms => ({
  uWall: { value: [0.93, 0.93, 0.95] },
  uWallDeep: { value: [0.88, 0.89, 0.92] },
  uLedge: { value: [0.1, 0.12, 0.15] },
  uLedgeTop: { value: [0.23, 0.25, 0.32] },
  uLine: { value: [0.48, 0.5, 0.57] },
  uAmbient: { value: 1 },
  uLedStrength: { value: 0.45 },
  uLedWash: { value: 0.1 },
  uGlow: { value: 0.25 },
  uReflect: { value: 0.05 },
  uShadowDepth: { value: 0.2 },
  uDim: { value: 0 },
  uFlat: { value: 0 },
  uLedges: { value: ledgeTexture(1) },
})

export const applyLighting = (uniforms: RoomUniforms, light: Lighting): void => {
  uniforms.uWall.value = light.wall
  uniforms.uWallDeep.value = light.wallDeep
  uniforms.uLedge.value = light.ledge
  uniforms.uLedgeTop.value = light.ledgeTop
  uniforms.uLine.value = light.line
  uniforms.uAmbient.value = light.ambient
  uniforms.uLedStrength.value = light.ledStrength
  uniforms.uLedWash.value = light.ledWash
  uniforms.uGlow.value = light.glow
  uniforms.uReflect.value = light.reflect
  uniforms.uShadowDepth.value = light.shadowDepth
}

/** A row of texels, one per ledge, holding that ledge's LED color. */
export const ledgeTexture = (count: number): DataTexture => {
  const width = Math.max(1, count)
  const texture = new DataTexture(new Uint8Array(width * 4), width, 1, RGBAFormat, UnsignedByteType)
  texture.needsUpdate = true
  return texture
}

export const writeLedge = (texture: DataTexture, ledge: number, [r, g, b]: Rgb): void => {
  const data = texture.image.data as Uint8Array
  data[ledge * 4] = Math.round(r * 255)
  data[ledge * 4 + 1] = Math.round(g * 255)
  data[ledge * 4 + 2] = Math.round(b * 255)
  data[ledge * 4 + 3] = 255
  texture.needsUpdate = true
}

/** The boxes are flattened toward this plane, a little in front of the wall, by `uFlat`. */
const FLATTEN = /* glsl */ `
  vec4 flattened(vec4 world) {
    world.z = mix(world.z, 24.0 + (world.z - 24.0) * 0.04, uFlat);
    return world;
  }
`

const ROOM = /* glsl */ `
  uniform vec3 uWall;
  uniform vec3 uWallDeep;
  uniform vec3 uLedge;
  uniform vec3 uLedgeTop;
  uniform vec3 uLine;
  uniform float uAmbient;
  uniform float uLedStrength;
  uniform float uLedWash;
  uniform float uGlow;
  uniform float uReflect;
  uniform float uShadowDepth;
  uniform float uDim;
  uniform float uFlat;
  uniform sampler2D uLedges;

  vec3 ledgeColor(float ledge) {
    return texelFetch(uLedges, ivec2(int(ledge + 0.5), 0), 0).rgb;
  }

  vec3 dimmed(vec3 color) {
    return color * mix(1.0, 0.42, uDim);
  }
`

/* ------------------------------------------------------------------ boxes */

const BOX_VERTEX = /* glsl */ `
  ${ROOM}
  ${FLATTEN}

  attribute vec3 aWash0;
  attribute vec3 aWash1;
  attribute vec3 aWash2;
  attribute vec3 aPlastic;
  attribute vec4 aCover;
  attribute vec4 aState;
  attribute vec4 aSpine;
  attribute float aLedge;

  out vec3 vLocal;
  out vec3 vNormal;
  out vec2 vUv;
  flat out vec3 vWash0;
  flat out vec3 vWash1;
  flat out vec3 vWash2;
  flat out vec3 vPlastic;
  flat out vec4 vCover;
  flat out vec4 vState;
  flat out vec4 vSpine;
  flat out vec3 vLed;

  void main() {
    vLocal = position;
    vNormal = normal;
    vUv = uv;
    vWash0 = aWash0;
    vWash1 = aWash1;
    vWash2 = aWash2;
    vPlastic = aPlastic;
    vCover = aCover;
    vState = aState;
    vSpine = aSpine;
    vLed = ledgeColor(aLedge);
    vec4 world = flattened(modelMatrix * instanceMatrix * vec4(position, 1.0));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const BOX_FRAGMENT = /* glsl */ `
  ${ROOM}

  uniform vec3 uSize;
  uniform sampler2D uCover0;
  uniform sampler2D uCover1;
  uniform sampler2D uCover2;
  uniform sampler2D uCover3;
  uniform vec2 uCoverCell;
  uniform sampler2D uOwn;
  uniform sampler2D uSpine0;
  uniform sampler2D uSpine1;
  uniform vec2 uSpineCell;
  uniform sampler2D uDigits;
  /** Width over height of the cover images: IGDB's are 90 by 128. */
  uniform float uCoverAspect;
  uniform float uDimmable;

  in vec3 vLocal;
  in vec3 vNormal;
  in vec2 vUv;
  flat in vec3 vWash0;
  flat in vec3 vWash1;
  flat in vec3 vWash2;
  flat in vec3 vPlastic;
  flat in vec4 vCover;
  flat in vec4 vState;
  flat in vec4 vSpine;
  flat in vec3 vLed;

  const float BACKLOG = 0.0;
  const float PLAYING = 1.0;
  const float COMPLETED = 2.0;
  const float DROPPED = 3.0;
  const float WISHLIST = 4.0;
  const float RETIRED = 6.0;

  // The 2D placeholder, as CSS draws it: two soft spots of color over a base.
  vec3 wash(vec2 uv) {
    vec2 p = vec2(uv.x, 1.0 - uv.y);
    float a = 1.0 - smoothstep(0.0, 0.68, length((p - vec2(0.25, 0.18)) / vec2(0.9, 0.7)));
    float b = 1.0 - smoothstep(0.0, 0.62, length((p - vec2(0.85, 0.92)) / vec2(0.85, 0.75)));
    vec3 color = mix(vWash2, vWash1, b);
    return mix(color, vWash0, a);
  }

  vec3 atlasCover(float page, vec2 uv) {
    if (page < 0.5) return texture(uCover0, uv).rgb;
    if (page < 1.5) return texture(uCover1, uv).rgb;
    if (page < 2.5) return texture(uCover2, uv).rgb;
    return texture(uCover3, uv).rgb;
  }

  // The cover on a face of the given aspect, filling it as object-fit: cover does.
  vec3 cover(vec2 uv, float faceAspect) {
    vec2 fit = uv - 0.5;
    if (faceAspect > uCoverAspect) fit.y *= uCoverAspect / faceAspect;
    else fit.x *= faceAspect / uCoverAspect;
    fit += 0.5;
    float source = vCover.x;
    vec2 cell = vCover.zw;
    // Image rows run top down.
    vec2 inCell = vec2(fit.x, 1.0 - fit.y);
    if (source > 1.5) return texture(uOwn, inCell).rgb;
    if (source > 0.5) return atlasCover(vCover.y, cell + inCell * uCoverCell);
    return wash(uv);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // A gold seal, as the 2D shelf's foil seal, turned in conic bands.
  vec4 seal(vec2 mm) {
    vec2 center = vec2(uSize.x - 9.0, uSize.y - 9.0);
    vec2 d = mm - center;
    float r = length(d);
    if (r > 8.0) return vec4(0.0);
    float turn = atan(d.y, d.x) / 6.28318 + 0.5;
    vec3 gold = mix(vec3(0.79, 0.64, 0.29), vec3(1.0, 0.96, 0.84), 0.5 + 0.5 * sin(turn * 18.0));
    float rim = smoothstep(6.6, 7.6, r);
    return vec4(mix(gold, vec3(0.23, 0.16, 0.02), rim * 0.8), 1.0 - smoothstep(7.6, 8.0, r));
  }

  // A matte square tag where the seal sits, as the 2D shelf's for a retired game.
  vec4 tag(vec2 mm) {
    vec2 d = abs(mm - vec2(uSize.x - 9.0, uSize.y - 9.0));
    float r = max(d.x, d.y);
    if (r > 7.0) return vec4(0.0);
    // An infinity sign drawn as two small rings side by side.
    vec2 p = mm - vec2(uSize.x - 9.0, uSize.y - 9.0);
    float ring = min(abs(length(p - vec2(-2.2, 0.0)) - 1.8), abs(length(p - vec2(2.2, 0.0)) - 1.8));
    float ink = 1.0 - smoothstep(0.35, 0.75, ring);
    vec3 face = mix(vec3(0.16, 0.18, 0.22), vec3(0.93, 0.94, 0.96), ink);
    float rim = smoothstep(5.8, 6.6, r);
    return vec4(mix(face, vec3(0.05, 0.06, 0.08), rim * 0.8), 1.0 - smoothstep(6.6, 7.0, r));
  }

  // The count on the foot of a game owned on more than one platform.
  vec4 owned(vec2 mm, float count) {
    if (count < 1.5) return vec4(0.0);
    vec2 corner = vec2(uSize.x - 20.0, 3.0);
    vec2 inPill = (mm - corner) / vec2(17.0, 12.0);
    if (inPill.x < 0.0 || inPill.x > 1.0 || inPill.y < 0.0 || inPill.y > 1.0) return vec4(0.0);
    // Digits 2 to 9 sit in a strip of ten cells; 9 also stands for more.
    float cell = min(count, 9.0);
    float ink = texture(uDigits, vec2((cell + inPill.x) / 10.0, 1.0 - inPill.y)).a;
    return vec4(mix(vec3(0.05, 0.06, 0.08), vec3(1.0), ink), 0.92);
  }

  void main() {
    vec3 n = normalize(vNormal);
    // Millimeters from the face's bottom left, whichever face this is.
    vec3 mm3 = vLocal + uSize * 0.5;
    float status = vState.x;
    bool coverOnly = vState.y > 0.5;
    float hot = vState.w;
    bool wishlist = abs(status - WISHLIST) < 0.5;
    bool front = n.z > 0.5;
    bool spineFace = n.x > 0.5 && vSpine.x > 0.5;

    vec3 color;
    float edge = 0.0;

    if (front) {
      vec2 mm = mm3.xy;
      vec2 inner0 = coverOnly ? vec2(0.0) : vec2(uSize.x * 0.025, uSize.y * 0.025);
      vec2 inner1 = coverOnly ? uSize.xy : vec2(uSize.x * 0.975, uSize.y * 0.915);
      bool onCover = all(greaterThanEqual(mm, inner0)) && all(lessThanEqual(mm, inner1));
      if (onCover) {
        vec2 uv = (mm - inner0) / (inner1 - inner0);
        color = cover(uv, (inner1.x - inner0.x) / (inner1.y - inner0.y));
        // The clear plastic over it: a soft sheen across the top left.
        color += vec3(0.06) * (1.0 - smoothstep(0.0, 0.45, uv.x + (1.0 - uv.y) * 0.6)) * (1.0 - float(coverOnly));
      } else {
        color = vPlastic;
        // The blank pill where a platform's logo would be printed.
        vec2 pill = (mm - vec2(uSize.x * 0.06, uSize.y * 0.943)) / vec2(uSize.x * 0.24, uSize.y * 0.028);
        if (pill.x > 0.0 && pill.x < 1.0 && pill.y > 0.0 && pill.y < 1.0) color = mix(color, vec3(1.0), 0.28);
      }
      // A darker edge on the side that hinges, and the gloss on the plastic.
      color *= mix(0.72, 1.0, smoothstep(0.0, uSize.x * 0.035, mm.x));
      if (abs(status - COMPLETED) < 0.5) {
        vec4 s = seal(mm);
        color = mix(color, s.rgb, s.a);
      } else if (abs(status - RETIRED) < 0.5) {
        vec4 s = tag(mm);
        color = mix(color, s.rgb, s.a);
      }
      vec4 count = owned(mm, vState.z);
      color = mix(color, count.rgb, count.a);
      // How close to the case's outline: the LED behind wraps round the edges.
      vec2 toEdge = min(mm, uSize.xy - mm);
      edge = 1.0 - smoothstep(0.0, 6.0, min(toEdge.x, toEdge.y));
    } else if (spineFace) {
      // Spine-out: the generated spine, drawn on a canvas in the 2D spine's type.
      vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
      vec2 at = vSpine.zw + uv * uSpineCell;
      color = vSpine.y < 0.5 ? texture(uSpine0, at).rgb : texture(uSpine1, at).rgb;
      edge = 1.0 - smoothstep(0.0, 3.0, min(mm3.z, uSize.z - mm3.z));
    } else {
      // The other faces: the plastic, shaded by which way they look.
      float shade = n.y > 0.5 ? 1.08 : n.y < -0.5 ? 0.55 : 0.78;
      color = vPlastic * shade;
    }

    if (wishlist) {
      // An outline where a box would stand, with a faint cover: never a solid box.
      vec3 inFace = front ? vec3(mm3.xy, 0.0) : spineFace ? vec3(mm3.zy, 0.0) : vec3(0.0);
      vec2 size = front ? uSize.xy : uSize.zy;
      vec2 toEdge = min(inFace.xy, size - inFace.xy);
      bool outline = (front || spineFace) && min(toEdge.x, toEdge.y) < 1.6;
      float dash = step(0.5, fract((inFace.x + inFace.y) / 9.0));
      if (outline && dash > 0.5) {
        gl_FragColor = vec4(dimmed(uLine), 1.0);
        return;
      }
      float faint = 0.38;
      if (!(front || spineFace) || hash(floor(gl_FragCoord.xy)) > faint) discard;
      float grey = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(grey), 0.55);
    }

    // Room light: covers stay readable with the lights off, as they do in 2D.
    float room = front || spineFace ? mix(0.84, 1.0, uAmbient) : mix(0.5, 1.0, uAmbient);
    color *= room;
    // Backlight from the LED bar: a tight rim on the edges, stronger in the dark.
    float rim = edge * uLedStrength * (0.35 + uGlow * 0.5);
    color = mix(color, vLed, rim * 0.75);
    // In focus or under the pointer: it glows in its own color.
    color += vLed * hot * (0.08 + uGlow * 0.12) * (front ? 1.0 : 0.5);

    gl_FragColor = vec4(mix(color, dimmed(color), uDimmable), 1.0);
  }
`

/** Textures the box shader reads. Any missing page is a single texel. */
export type BoxTextures = {
  covers: Texture[]
  coverCell: [number, number]
  own: Texture
  spines: Texture[]
  spineCell: [number, number]
  digits: Texture
}

export const boxMaterial = (
  room: RoomUniforms,
  textures: BoxTextures,
  size: [number, number, number],
  dimmable = true,
): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: BOX_VERTEX,
    fragmentShader: BOX_FRAGMENT,
    uniforms: {
      ...room,
      uSize: { value: size },
      uCover0: { value: textures.covers[0] },
      uCover1: { value: textures.covers[1] },
      uCover2: { value: textures.covers[2] },
      uCover3: { value: textures.covers[3] },
      uCoverCell: { value: textures.coverCell },
      uOwn: { value: textures.own },
      uSpine0: { value: textures.spines[0] },
      uSpine1: { value: textures.spines[1] },
      uSpineCell: { value: textures.spineCell },
      uDigits: { value: textures.digits },
      uCoverAspect: { value: 90 / 128 },
      uDimmable: { value: dimmable ? 1 : 0 },
    },
  })

/* ------------------------------------------------------------ the wall */

const WALL_VERTEX = /* glsl */ `
  ${ROOM}
  out vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const WALL_FRAGMENT = /* glsl */ `
  ${ROOM}
  uniform float uTop;
  in vec3 vWorld;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  void main() {
    // Darker toward the floor and the ceiling, as a lit wall is.
    float height = clamp(vWorld.y / uTop, 0.0, 1.0);
    vec3 color = mix(uWallDeep, uWall, smoothstep(0.0, 0.35, height) * (1.0 - smoothstep(0.85, 1.25, height)));
    // The painted wall's grain, as the 2D wall has it.
    color += (hash(floor(vWorld.xy / 3.0)) - 0.5) * 0.018;
    gl_FragColor = vec4(dimmed(color), 1.0);
  }
`

export const wallMaterial = (room: RoomUniforms, top: number): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT,
    uniforms: { ...room, uTop: { value: top } },
  })

/* --------------------------------------------- the glow on the wall, per ledge */

const GLOW_VERTEX = /* glsl */ `
  ${ROOM}
  attribute float aLedge;
  out vec2 vUv;
  flat out vec3 vLed;
  void main() {
    vUv = uv;
    vLed = ledgeColor(aLedge);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

const GLOW_FRAGMENT = /* glsl */ `
  ${ROOM}
  in vec2 vUv;
  flat in vec3 vLed;
  void main() {
    // Brightest just above the bar, fading up the wall and toward the ends.
    float up = exp(-vUv.y * 3.2);
    float across = smoothstep(0.0, 0.12, vUv.x) * smoothstep(0.0, 0.12, 1.0 - vUv.x);
    float strength = up * across * (uLedWash * 2.2 + uGlow * 0.42) * (0.5 + uLedStrength * 0.5);
    gl_FragColor = vec4(dimmed(vLed * strength), 1.0);
  }
`

export const glowMaterial = (room: RoomUniforms): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: { ...room },
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })

/* ----------------------------------------------- ledges, uprights, LED bars */

const PART_VERTEX = /* glsl */ `
  ${ROOM}
  ${FLATTEN}
  attribute float aLedge;
  attribute float aKind;
  out vec3 vNormal;
  out vec2 vUv;
  flat out vec3 vLed;
  flat out float vKind;
  void main() {
    vNormal = normal;
    vUv = uv;
    vLed = ledgeColor(aLedge);
    vKind = aKind;
    vec4 world = flattened(modelMatrix * instanceMatrix * vec4(position, 1.0));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/** What a part is: a ledge, an upright between bays, or the LED bar along a ledge's back. */
export const PART_LEDGE = 0
export const PART_UPRIGHT = 1
export const PART_BAR = 2

const PART_FRAGMENT = /* glsl */ `
  ${ROOM}
  in vec3 vNormal;
  in vec2 vUv;
  flat in vec3 vLed;
  flat in float vKind;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 color;
    if (vKind > 1.5) {
      // The LED bar: the line of light itself.
      color = mix(vLed, vec3(1.0), 0.35) * (0.55 + uLedStrength * 0.45);
    } else if (n.y > 0.5) {
      // The ledge's top catches the LED, most at the back where the bar is.
      color = mix(uLedgeTop, vLed, uReflect * (0.6 + 0.4 * (1.0 - vUv.y)));
    } else if (n.z > 0.5) {
      color = uLedge * mix(0.9, 1.15, uAmbient);
    } else {
      color = uLedge * 0.7;
    }
    gl_FragColor = vec4(dimmed(color), 1.0);
  }
`

export const partMaterial = (room: RoomUniforms): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: PART_VERTEX,
    fragmentShader: PART_FRAGMENT,
    uniforms: { ...room },
  })

/* ------------------------------------------------------ the shelves' labels */

const LABEL_VERTEX = /* glsl */ `
  ${ROOM}
  attribute vec4 aCell;
  out vec2 vUv;
  void main() {
    vUv = aCell.xy + vec2(uv.x, 1.0 - uv.y) * aCell.zw;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

const LABEL_FRAGMENT = /* glsl */ `
  ${ROOM}
  uniform sampler2D uAtlas;
  in vec2 vUv;
  void main() {
    vec4 ink = texture(uAtlas, vUv);
    if (ink.a < 0.02) discard;
    gl_FragColor = vec4(dimmed(ink.rgb), ink.a);
  }
`

export const labelMaterial = (room: RoomUniforms, atlas: Texture): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: LABEL_VERTEX,
    fragmentShader: LABEL_FRAGMENT,
    uniforms: { ...room, uAtlas: { value: atlas } },
    transparent: true,
    depthWrite: false,
  })
