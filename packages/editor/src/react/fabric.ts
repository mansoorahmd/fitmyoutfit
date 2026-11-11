/**
 * Shading for cloth: the garment's material is a plain standard material
 * (rough, not metallic, both sides drawn) with two small additions made in its
 * shader, both cheap enough for a phone:
 *
 * - Baked ambient occlusion. A model may carry, per vertex, how open the cloth
 *   is to light on its outside and on its inside (custom glTF attribute
 *   `_OCCLUSION`, two values 0 to 1; see scripts/process-stand-in-model.ts).
 *   Folds, armpits and the inside of the garment are darkened by it.
 * - The inside. A garment model is a single layer of cloth, so through the
 *   neck and the sleeves its back faces show. They are drawn darker, as the
 *   shaded inside of a garment, instead of lit like the outside.
 *
 * No Three.js import here beyond types: the patch only edits shader text and
 * geometry attributes, so the module stays light.
 */
import type { BufferGeometry, Material, WebGLProgramParametersWithUniforms } from "three";

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
}

export const DEFAULT_FABRIC_SHADING: FabricShading = { outsideFloor: 0.42, insideFloor: 0.3, insideOpen: 0.78 };

const number = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));

/** The shader edits: pure text transformations, tested without a GPU. */
export function patchFabricShader(
  shader: { vertexShader: string; fragmentShader: string },
  hasOcclusion: boolean,
  shading: FabricShading = DEFAULT_FABRIC_SHADING,
): { vertexShader: string; fragmentShader: string } {
  const define = hasOcclusion ? "#define FMO_OCCLUSION\n" : "";
  const vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>\n${define}#ifdef FMO_OCCLUSION\nattribute vec2 ${OCCLUSION_ATTRIBUTE};\nvarying vec2 vFmoOcclusion;\n#endif`,
    )
    .replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef FMO_OCCLUSION\nvFmoOcclusion = " + OCCLUSION_ATTRIBUTE + ";\n#endif");
  const fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${define}#ifdef FMO_OCCLUSION\nvarying vec2 vFmoOcclusion;\n#endif`)
    .replace(
      "#include <color_fragment>",
      [
        "#include <color_fragment>",
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
  if (vertexShader === shader.vertexShader || fragmentShader === shader.fragmentShader) {
    throw new Error("the fabric shading could not find its place in the material's shader (a Three.js change?)");
  }
  return { vertexShader, fragmentShader };
}

/**
 * Makes a garment material shade like cloth (see the module comment). Call it
 * once per material, with the geometry the material is drawn on. Materials
 * with and without occlusion compile to separate, shared programs.
 */
export function makeFabric(material: Material, geometry: BufferGeometry, shading: FabricShading = DEFAULT_FABRIC_SHADING): void {
  const source = geometry.getAttribute(OCCLUSION_ATTRIBUTE_GLTF);
  if (source && !geometry.getAttribute(OCCLUSION_ATTRIBUTE)) geometry.setAttribute(OCCLUSION_ATTRIBUTE, source);
  const hasOcclusion = Boolean(geometry.getAttribute(OCCLUSION_ATTRIBUTE));
  material.onBeforeCompile = (parameters: WebGLProgramParametersWithUniforms) => {
    const patched = patchFabricShader(parameters, hasOcclusion, shading);
    parameters.vertexShader = patched.vertexShader;
    parameters.fragmentShader = patched.fragmentShader;
  };
  const key = `fmo-fabric:${hasOcclusion ? 1 : 0}:${shading.outsideFloor}:${shading.insideFloor}:${shading.insideOpen}`;
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}
