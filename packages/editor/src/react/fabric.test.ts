import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, MeshStandardMaterial, ShaderLib, Texture } from "three";
import { DEFAULT_FABRIC_SHADING, OCCLUSION_ATTRIBUTE, OCCLUSION_ATTRIBUTE_GLTF, makeFabric, patchFabricShader } from "./fabric";

// The real shaders of Three.js's standard material, which the garment uses.
const standard = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };

describe("patchFabricShader", () => {
  it("reads the baked occlusion and shades the inside darker, with the values given", () => {
    const patched = patchFabricShader(standard, true);
    expect(patched.vertexShader).toContain("#define FMO_OCCLUSION");
    expect(patched.vertexShader).toContain(`attribute vec2 ${OCCLUSION_ATTRIBUTE};`);
    expect(patched.vertexShader).toContain(`vFmoOcclusion = ${OCCLUSION_ATTRIBUTE};`);
    expect(patched.fragmentShader).toContain("varying vec2 vFmoOcclusion;");
    expect(patched.fragmentShader).toContain("gl_FrontFacing");
    expect(patched.fragmentShader).toContain(`mix(${DEFAULT_FABRIC_SHADING.outsideFloor}, 1.0, fmoOpen.x)`);
    expect(patched.fragmentShader).toContain(`mix(${DEFAULT_FABRIC_SHADING.insideFloor}, ${DEFAULT_FABRIC_SHADING.insideOpen}, fmoOpen.y)`);
    // After the colour (map) is applied, before lighting.
    const fs = patched.fragmentShader;
    expect(fs.indexOf("fmoOpen")).toBeGreaterThan(fs.indexOf("#include <color_fragment>"));
    expect(fs.indexOf("fmoOpen")).toBeLessThan(fs.indexOf("#include <lights_fragment_begin>"));
  });

  it("shows the inside texture (the fabric's colours, no prints) on back faces only, before shading", () => {
    const fs = patchFabricShader(standard, true).fragmentShader;
    expect(fs).toContain("uniform sampler2D fmoInsideMap;");
    expect(fs).toContain("if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(fmoInsideMap, vMapUv).rgb * diffuse, fmoInsideMix);");
    expect(fs.indexOf("fmoInsideMap, vMapUv")).toBeLessThan(fs.indexOf("vec2 fmoOpen"));
  });

  it("still shades the inside darker on a model without occlusion data", () => {
    const patched = patchFabricShader(standard, false);
    expect(patched.vertexShader).not.toContain("#define FMO_OCCLUSION");
    expect(patched.fragmentShader).toContain("vec2 fmoOpen = vec2(1.0);");
    expect(patched.fragmentShader).toContain("gl_FrontFacing");
  });

  it("writes whole numbers as GLSL floats", () => {
    const patched = patchFabricShader(standard, true, { outsideFloor: 0, insideFloor: 1, insideOpen: 1 });
    expect(patched.fragmentShader).toContain("mix(0.0, 1.0, fmoOpen.x)");
    expect(patched.fragmentShader).toContain("mix(1.0, 1.0, fmoOpen.y)");
  });

  it("fails loudly when the shader has changed and the patch would silently do nothing", () => {
    expect(() => patchFabricShader({ vertexShader: "void main() {}", fragmentShader: "void main() {}" }, true)).toThrow(/could not find/);
  });
});

describe("makeFabric", () => {
  it("makes the model's occlusion attribute readable by the shader and patches the material once compiled", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
    geometry.setAttribute(OCCLUSION_ATTRIBUTE_GLTF, new BufferAttribute(new Uint16Array(6), 2, true));
    const material = new MeshStandardMaterial();
    makeFabric(material, geometry);
    expect(geometry.getAttribute(OCCLUSION_ATTRIBUTE)).toBe(geometry.getAttribute(OCCLUSION_ATTRIBUTE_GLTF));
    const parameters = { ...standard, uniforms: {} } as unknown as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(parameters, undefined as never);
    expect(parameters.vertexShader).toContain("#define FMO_OCCLUSION");
    // Materials with the same shading share one compiled program.
    const other = new MeshStandardMaterial();
    makeFabric(other, geometry);
    expect(other.customProgramCacheKey()).toBe(material.customProgramCacheKey());
  });

  it("gives each material its own inside texture, switched on when one is set", () => {
    const geometry = new BufferGeometry();
    const a = new MeshStandardMaterial();
    const b = new MeshStandardMaterial();
    const fabricA = makeFabric(a, geometry);
    makeFabric(b, geometry);
    const compile = (m: MeshStandardMaterial) => {
      const parameters = { ...standard, uniforms: {} } as unknown as Parameters<typeof m.onBeforeCompile>[0];
      m.onBeforeCompile(parameters, undefined as never);
      return parameters.uniforms as Record<string, { value: unknown }>;
    };
    const uniformsA = compile(a);
    const uniformsB = compile(b);
    expect(uniformsA.fmoInsideMix!.value).toBe(0);
    const inside = new Texture();
    fabricA.setInsideMap(inside);
    expect(uniformsA.fmoInsideMap!.value).toBe(inside);
    expect(uniformsA.fmoInsideMix!.value).toBe(1);
    expect(uniformsB.fmoInsideMap!.value).toBeNull();
    fabricA.setInsideMap(null);
    expect(uniformsA.fmoInsideMix!.value).toBe(0);
  });

  it("compiles a separate program for models without occlusion", () => {
    const plain = new BufferGeometry();
    plain.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
    const withOcclusion = new BufferGeometry();
    withOcclusion.setAttribute(OCCLUSION_ATTRIBUTE_GLTF, new BufferAttribute(new Uint16Array(6), 2, true));
    const a = new MeshStandardMaterial();
    const b = new MeshStandardMaterial();
    makeFabric(a, plain);
    makeFabric(b, withOcclusion);
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });
});
