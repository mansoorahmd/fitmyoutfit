/**
 * Shading for cloth: the garment's material is a plain standard material
 * (rough, not metallic, both sides drawn) with small additions made in its
 * shader, all cheap enough for a phone:
 *
 * - Baked ambient occlusion. A model may carry, per vertex, how open the cloth
 *   is to light on its outside and on its inside (custom glTF attribute
 *   `_OCCLUSION`, two values 0 to 1; see scripts/process-stand-in-model.ts).
 *   Folds, armpits and the inside of the garment are darkened by it.
 * - The inside. A garment model is a single layer of cloth, so through the
 *   neck and the sleeves its back faces show. They are drawn as the shaded
 *   inside of the garment: darker, and in the fabric's colours only (an
 *   "inside" texture with the colour zones and no prints), because a print
 *   seen mirrored through the neck looks like a fault, and most decoration
 *   methods (screen print, DTF, embroidery) do not show on the inside.
 *
 * - G3, smooth sports polyester, by material and light only (it replaces E3g's
 *   12 mm knit, which read as a sweater): a smoother material than cotton
 *   (a soft highlight that follows the folds, neither plastic nor wet), a soft
 *   sheen at grazing angles tinted by the cloth's own colour, and, only at the
 *   closest zooms, a very fine, shallow micro-structure at about its real
 *   scale (fabric-weave.ts: an interlock knit, or a pinhole mesh where the
 *   product says so), which fades out by itself where it would be only a few
 *   pixels. None of it changes the colour seen square-on, where the colour the
 *   customer picked must show true.
 *
 * Only the micro-structure's texture needs Three.js; the patch
 * itself only edits shader text and geometry attributes.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  ShaderChunk,
  UnsignedByteType,
  type BufferGeometry,
  type Material,
  type MeshStandardMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { MICRO_SIZE, makeMicroNormals, type MicroSurface } from "./fabric-weave.js";

/** The glTF attribute `_OCCLUSION`, as GLTFLoader names it, and the name the shader reads it under. */
export const OCCLUSION_ATTRIBUTE_GLTF = "_occlusion";
export const OCCLUSION_ATTRIBUTE = "fmoOcclusion";

/** How the occlusion and the inside are shaded. Brightness factors, 0 to 1. */
export interface FabricShading {
  /** Brightness of fully occluded cloth on the outside (open cloth is 1). */
  outsideFloor: number;
  /** Brightness of fully occluded cloth on the inside. */
  insideFloor: number;
  /** Brightness of fully open cloth on the inside: the inside of a garment is a little darker than the outside. */
  insideOpen: number;
  /** Strength of the soft sheen at grazing angles (0 none). */
  sheen?: number;
  /** The material's roughness: polyester is smooth, a little shinier than cotton, but not glossy. */
  roughness?: number;
  /** G3: how deep the micro-structure looks where it shows fully (the normal map's scale). */
  microDepth?: number;
}

export const DEFAULT_FABRIC_SHADING: FabricShading = { outsideFloor: 0.38, insideFloor: 0.3, insideOpen: 0.62, sheen: 0.3, roughness: 0.5, microDepth: 0.6 };

const number = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));

/** The shader edits: pure text transformations, tested without a GPU. */
export function patchFabricShader(
  shader: { vertexShader: string; fragmentShader: string },
  hasOcclusion: boolean,
  shading: FabricShading = DEFAULT_FABRIC_SHADING,
  micro = false,
): { vertexShader: string; fragmentShader: string } {
  const define = hasOcclusion ? "#define FMO_OCCLUSION\n" : "";
  const vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>\n${define}#ifdef FMO_OCCLUSION\nattribute vec2 ${OCCLUSION_ATTRIBUTE};\nvarying vec2 vFmoOcclusion;\n#endif`,
    )
    .replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef FMO_OCCLUSION\nvFmoOcclusion = " + OCCLUSION_ATTRIBUTE + ";\n#endif");
  let fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>\n${define}#ifdef FMO_OCCLUSION\nvarying vec2 vFmoOcclusion;\n#endif\nuniform sampler2D fmoInsideMap;\nuniform float fmoInsideMix;`,
    )
    .replace(
      "#include <color_fragment>",
      [
        "#include <color_fragment>",
        "#ifdef USE_MAP",
        // The inside shows the fabric's colours (the inside texture), not the prints.
        "if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(fmoInsideMap, vMapUv).rgb * diffuse, fmoInsideMix);",
        "#endif",
        "#ifdef FMO_OCCLUSION",
        "vec2 fmoOpen = vFmoOcclusion;",
        "#else",
        "vec2 fmoOpen = vec2(1.0);",
        "#endif",
        "diffuseColor.rgb *= gl_FrontFacing",
        `  ? mix(${number(shading.outsideFloor)}, 1.0, fmoOpen.x)`,
        `  : mix(${number(shading.insideFloor)}, ${number(shading.insideOpen)}, fmoOpen.y);`,
      ].join("\n"),
    );
  // E3g: soft sheen after the lights, at grazing angles of the outside only (square-on it adds nothing).
  const sheen = shading.sheen ?? 0;
  if (sheen > 0) {
    fragmentShader = fragmentShader.replace(
      "#include <aomap_fragment>",
      [
        "#include <aomap_fragment>",
        "if (gl_FrontFacing) {",
        "  float fmoRim = 1.0 - saturate(dot(normal, normalize(vViewPosition)));",
        `  reflectedLight.indirectDiffuse += diffuseColor.rgb * (fmoRim * fmoRim * fmoRim * ${number(sheen)});`,
        "}",
      ].join("\n"),
    );
  }
  // G3: the micro-structure. The chunk is expanded here (the shader still says `#include <normal_fragment_maps>`
  // when this runs). Its amount is one uniform for the whole garment, set from the zoom in CSS pixels (microAmount);
  // per pixel it also fades out where a tile (2.5 mm) is under five device pixels, gone under three: no shimmer or
  // crawl when the garment turns, at a grazing angle or on a desktop's coarser pixels.
  if (micro) {
    const fade = "vec2 fmoPx = fwidth( vNormalMapUv ); mapN.xy *= normalScale * fmoMicro * ( 1.0 - smoothstep( 0.2, 0.33, max( fmoPx.x, fmoPx.y ) ) );";
    fragmentShader = fragmentShader.replace("uniform float fmoInsideMix;", "uniform float fmoInsideMix;\nuniform float fmoMicro;");
    fragmentShader = fragmentShader.replace("#include <normal_fragment_maps>", ShaderChunk.normal_fragment_maps.replace("mapN.xy *= normalScale;", fade));
  }
  if (vertexShader === shader.vertexShader || fragmentShader === shader.fragmentShader) {
    throw new Error("the fabric shading could not find its place in the material's shader (a Three.js change?)");
  }
  return { vertexShader, fragmentShader };
}

/** Controls for one garment material made into fabric. */
export interface Fabric {
  /** The texture the inside shows (the colour zones without prints), or null to show the outside's texture. */
  setInsideMap(texture: Texture | null): void;
  /** How much of the micro-structure shows, 0 to 1 (fabric-weave.ts `microAmount`); no effect on a fabric without one. */
  setMicro(amount: number): void;
}

/**
 * Makes a garment material shade like cloth (see the module comment). Call it
 * once per material, with the geometry the material is drawn on. Materials
 * with and without occlusion compile to separate, shared programs; each
 * material keeps its own inside texture.
 */
export function makeFabric(
  material: Material,
  geometry: BufferGeometry,
  shading: FabricShading = DEFAULT_FABRIC_SHADING,
  /** G3: the micro-structure and its tiles per UV unit (the model's millimetres per UV unit over the tile's size); null: none. */
  micro: { surface: MicroSurface; repeat: number } | null = null,
): Fabric {
  const source = geometry.getAttribute(OCCLUSION_ATTRIBUTE_GLTF);
  if (source && !geometry.getAttribute(OCCLUSION_ATTRIBUTE)) geometry.setAttribute(OCCLUSION_ATTRIBUTE, source);
  const hasOcclusion = Boolean(geometry.getAttribute(OCCLUSION_ATTRIBUTE));
  const standard = material as MeshStandardMaterial;
  if (typeof shading.roughness === "number" && "roughness" in material) standard.roughness = shading.roughness;
  const withMicro = micro !== null && micro.repeat > 0 && "normalMap" in material;
  if (withMicro) {
    standard.normalMap = microTexture(micro.surface, micro.repeat);
    const depth = shading.microDepth ?? 1;
    standard.normalScale.set(depth, depth);
  }
  const insideMap: { value: Texture | null } = { value: null };
  const insideMix = { value: 0 };
  const microUniform = { value: 0 };
  material.onBeforeCompile = (parameters: WebGLProgramParametersWithUniforms) => {
    const patched = patchFabricShader(parameters, hasOcclusion, shading, withMicro);
    parameters.vertexShader = patched.vertexShader;
    parameters.fragmentShader = patched.fragmentShader;
    parameters.uniforms.fmoInsideMap = insideMap;
    parameters.uniforms.fmoInsideMix = insideMix;
    parameters.uniforms.fmoMicro = microUniform;
  };
  const key = `fmo-fabric:${hasOcclusion ? 1 : 0}:${shading.outsideFloor}:${shading.insideFloor}:${shading.insideOpen}:${shading.sheen ?? 0}:${withMicro ? 1 : 0}`;
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return {
    setInsideMap(texture) {
      insideMap.value = texture;
      insideMix.value = texture ? 1 : 0;
    },
    setMicro(amount) {
      microUniform.value = amount;
    },
  };
}

const microTextures = new Map<string, DataTexture>();

/**
 * The micro-structure's normal map for a model whose UV unit is `repeat` tiles wide. One 4 KB texture per surface
 * and repeat, shared by every material (and never disposed: it is small and a model comes back).
 */
export function microTexture(surface: MicroSurface, repeat: number): DataTexture {
  const key = `${surface}:${Math.round(repeat * 100)}`;
  let texture = microTextures.get(key);
  if (!texture) {
    texture = new DataTexture(makeMicroNormals(surface), MICRO_SIZE, MICRO_SIZE, RGBAFormat, UnsignedByteType);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    microTextures.set(key, texture);
  }
  return texture;
}
