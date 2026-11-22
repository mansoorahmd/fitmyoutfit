import { describe, expect, it } from "vitest";
import { KNIT_FULL_PX, KNIT_OFF_PX, WEAVE_SIZE, WEAVE_TILE_MM, knitAmount, makeWeaveNormals, tileCssPixels, weaveHeight } from "./fabric-weave";
import { patchFabricShader } from "./fabric";
import { ShaderLib } from "three";

describe("the knit's normal map", () => {
  const data = makeWeaveNormals();
  it("is a small RGBA tile, 16 KB", () => {
    expect(data.length).toBe(WEAVE_SIZE * WEAVE_SIZE * 4);
    expect(data.length).toBeLessThanOrEqual(16 * 1024);
  });
  it("is flat on average (the cloth's colour and shape are not tilted by it) and has relief", () => {
    let sx = 0, sy = 0, steep = 0;
    for (let i = 0; i < data.length; i += 4) {
      sx += data[i]! - 128;
      sy += data[i + 1]! - 128;
      if (Math.abs(data[i]! - 128) > 20 || Math.abs(data[i + 1]! - 128) > 20) steep++;
    }
    const n = WEAVE_SIZE * WEAVE_SIZE;
    expect(Math.abs(sx / n)).toBeLessThan(3);
    expect(Math.abs(sy / n)).toBeLessThan(3);
    expect(steep / n).toBeGreaterThan(0.2);
  });
  it("tiles without a seam: the height wraps", () => {
    for (const t of [0.13, 0.5, 0.77]) {
      expect(weaveHeight(0, t)).toBeCloseTo(weaveHeight(1, t), 6);
      expect(weaveHeight(t, 0)).toBeCloseTo(weaveHeight(t, 1), 6);
    }
  });
  it("covers more than a real stitch on purpose, so it reads at the closest zoom", () => {
    expect(WEAVE_TILE_MM).toBeGreaterThanOrEqual(6);
  });
});

describe("the knit in the shader", () => {
  const standard = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
  it("fades the knit out by itself when a tile is only a few pixels, and only with a weave", () => {
    const withWeave = patchFabricShader(standard, true, undefined, true).fragmentShader;
    expect(withWeave).toContain("fwidth( vNormalMapUv )");
    expect(withWeave).toContain("smoothstep");
    expect(patchFabricShader(standard, true).fragmentShader).not.toContain("fmoPx");
  });
  it("takes its amount from one uniform for the whole garment, and keeps only a grazing guard per pixel", () => {
    const fs = patchFabricShader(standard, true, undefined, true).fragmentShader;
    expect(fs).toContain("uniform float fmoKnit;");
    expect(fs).toContain("normalScale * fmoKnit");
  });
  it("adds the sheen only on the outside, after the lights", () => {
    const fs = patchFabricShader(standard, true).fragmentShader;
    expect(fs.indexOf("fmoRim")).toBeGreaterThan(fs.indexOf("#include <lights_fragment_end>"));
    expect(fs).toContain("if (gl_FrontFacing)");
    expect(patchFabricShader(standard, true, { outsideFloor: 0.4, insideFloor: 0.4, insideOpen: 0.8 }).fragmentShader).not.toContain("fmoRim");
  });
});

describe("how much knit shows", () => {
  it("is none at the resting view of every viewport, whatever the device pixel ratio (it counts CSS pixels)", () => {
    // Resting: the jersey (0.69 high) fills about 65% of the canvas's height (measured: 1.68 away in an 836 px canvas).
    const FOV = 35;
    for (const height of [640 - 64, 844 - 64, 768 - 64, 900 - 64, 1080 - 64]) {
      const distance = 0.69 / 0.67 / (2 * Math.tan((FOV * Math.PI) / 360));
      expect(knitAmount(tileCssPixels(distance, FOV, height))).toBe(0);
    }
  });
  it("comes in smoothly with the zoom, with no step", () => {
    let last = 0;
    for (let px = 0; px <= 80; px += 0.5) {
      const a = knitAmount(px);
      expect(a).toBeGreaterThanOrEqual(last);
      expect(a - last).toBeLessThan(0.08);
      last = a;
    }
    expect(knitAmount(KNIT_OFF_PX)).toBe(0);
    expect(knitAmount(KNIT_FULL_PX)).toBe(1);
  });
});
