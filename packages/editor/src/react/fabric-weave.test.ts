import { describe, expect, it } from "vitest";
import { MICRO_FULL_PX_PER_MM, MICRO_OFF_PX_PER_MM, MICRO_SIZE, MICRO_TILE_MM, cssPxPerMm, microAmount, microHeight, makeMicroNormals, type MicroSurface } from "./fabric-weave";
import { patchFabricShader } from "./fabric";
import { ShaderLib } from "three";

describe.each(["interlock", "mesh"] as MicroSurface[])("the %s micro-structure's normal map", (surface) => {
  const data = makeMicroNormals(surface);
  it("is a small RGBA tile, 4 KB", () => {
    expect(data.length).toBe(MICRO_SIZE * MICRO_SIZE * 4);
    expect(data.length).toBeLessThanOrEqual(4 * 1024);
  });
  it("is flat on average and has relief, but a shallow one", () => {
    let sx = 0, sy = 0, steep = 0, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      sx += data[i]! - 128;
      sy += data[i + 1]! - 128;
      const t = Math.max(Math.abs(data[i]! - 128), Math.abs(data[i + 1]! - 128));
      max = Math.max(max, t);
      if (t > 10) steep++;
    }
    const n = MICRO_SIZE * MICRO_SIZE;
    expect(Math.abs(sx / n)).toBeLessThan(3);
    expect(Math.abs(sy / n)).toBeLessThan(3);
    expect(steep / n).toBeGreaterThan(0.05);
    expect(max).toBeLessThan(100);
  });
  it("tiles without a seam: the height wraps", () => {
    for (const t of [0.13, 0.5, 0.77]) {
      expect(microHeight(surface, 0, t)).toBeCloseTo(microHeight(surface, 1, t), 6);
      expect(microHeight(surface, t, 0)).toBeCloseTo(microHeight(surface, t, 1), 6);
    }
  });
});

describe("the micro-structure's scale", () => {
  it("is about the real scale of the cloth: a tile of a few millimetres, not a knit you can count at arm's length", () => {
    expect(MICRO_TILE_MM).toBeGreaterThan(1);
    expect(MICRO_TILE_MM).toBeLessThanOrEqual(4);
  });
  it("the mesh has eyelets (low points) in a flat face", () => {
    let low = 0, high = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const h = microHeight("mesh", (x + 0.5) / 20, (y + 0.5) / 20);
      if (h < 0.1) low++;
      if (h > 0.45) high++;
    }
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });
});

describe("the micro-structure in the shader", () => {
  const standard = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
  it("fades by itself when a tile is only a few pixels, and only with a micro-structure", () => {
    const withMicro = patchFabricShader(standard, true, undefined, true).fragmentShader;
    expect(withMicro).toContain("fwidth( vNormalMapUv )");
    expect(withMicro).toContain("smoothstep");
    expect(patchFabricShader(standard, true).fragmentShader).not.toContain("fmoPx");
  });
  it("takes its amount from one uniform for the whole garment, and keeps only a grazing guard per pixel", () => {
    const fs = patchFabricShader(standard, true, undefined, true).fragmentShader;
    expect(fs).toContain("uniform float fmoMicro;");
    expect(fs).toContain("normalScale * fmoMicro");
  });
  it("adds the sheen only on the outside, after the lights", () => {
    const fs = patchFabricShader(standard, true).fragmentShader;
    expect(fs.indexOf("fmoRim")).toBeGreaterThan(fs.indexOf("#include <lights_fragment_end>"));
    expect(fs).toContain("if (gl_FrontFacing)");
    expect(patchFabricShader(standard, true, { outsideFloor: 0.4, insideFloor: 0.4, insideOpen: 0.8 }).fragmentShader).not.toContain("fmoRim");
  });
});

describe("how much micro-structure shows", () => {
  it("is none at the resting view and at a mid zoom of every viewport, whatever the device pixel ratio (it counts CSS pixels)", () => {
    const FOV = 35;
    for (const height of [640 - 64, 844 - 64, 768 - 64, 900 - 64, 1080 - 64]) {
      // Resting: the whole person, 1.8 m, fills about 85% of the canvas's height; mid zoom: the jersey (0.7 m) fills it.
      const rest = 1.8 / 0.85 / (2 * Math.tan((FOV * Math.PI) / 360));
      const mid = 0.7 / 0.9 / (2 * Math.tan((FOV * Math.PI) / 360));
      expect(microAmount(cssPxPerMm(rest, FOV, height))).toBe(0);
      expect(microAmount(cssPxPerMm(mid, FOV, height))).toBe(0);
    }
  });
  it("comes in smoothly with the zoom, with no step", () => {
    let last = 0;
    for (let px = 0; px <= 8; px += 0.02) {
      const a = microAmount(px);
      expect(a).toBeGreaterThanOrEqual(last);
      expect(a - last).toBeLessThan(0.1);
      last = a;
    }
    expect(microAmount(MICRO_OFF_PX_PER_MM)).toBe(0);
    expect(microAmount(MICRO_FULL_PX_PER_MM)).toBe(1);
  });
});
