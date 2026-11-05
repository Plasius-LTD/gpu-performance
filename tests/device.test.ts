import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { createDeviceProfile, negotiateFrameTarget } from "../src/index.js";

describe("device profile", () => {
  it("uses the public gpu-shared package surface for the browser demo", () => {
    const demoSource = fs.readFileSync(
      path.resolve(process.cwd(), "demo", "main.js"),
      "utf8"
    );
    const demoHtml = fs.readFileSync(
      path.resolve(process.cwd(), "demo", "index.html"),
      "utf8"
    );

    expect(demoSource).toContain('from "@plasius/gpu-shared"');
    expect(demoSource).not.toContain("node_modules/@plasius/gpu-shared/dist");
    expect(demoHtml).toContain('<script type="importmap">');
    expect(demoHtml).toContain(
      '"@plasius/gpu-shared": "../node_modules/@plasius/gpu-shared/dist/index.js"'
    );
  });

  it("loads the current published gpu-shared runtime contract", async () => {
    const shared = await import("@plasius/gpu-shared");

    expect(typeof shared.mountGpuShowcase).toBe("function");
    expect(shared.showcaseDemoModes).toContain("harbor");
  });

  it("defaults XR hardware to immersive VR mode and 72 Hz", () => {
    const profile = createDeviceProfile({
      deviceClass: "xr-headset",
    });

    expect(profile.mode).toBe("immersive-vr");
    expect(profile.refreshRateHz).toBe(72);
    expect(profile.supportedFrameRates).toEqual([72]);
  });

  it("negotiates native XR cadence when the headset supports it", () => {
    const target = negotiateFrameTarget({
      mode: "immersive-vr",
      deviceRefreshRateHz: 72,
      supportedFrameRates: [72, 90],
      minimumFrameRate: 60,
    });

    expect(target.targetFrameRate).toBe(72);
    expect(target.targetFrameTimeMs).toBeCloseTo(1000 / 72, 6);
    expect(target.rationale.join(" ")).toContain("native 72 Hz immersive session target");
  });

  it("negotiates upward on flat displays when higher stable buckets exist", () => {
    const target = negotiateFrameTarget({
      mode: "flat",
      deviceRefreshRateHz: 144,
      minimumFrameRate: 60,
    });

    expect(target.targetFrameRate).toBe(120);
    expect(target.candidateFrameRates[0]).toBe(120);
  });

  it("rejects invalid device profile enum values", () => {
    expect(() =>
      createDeviceProfile({
        deviceClass: "console" as never,
      })
    ).toThrow(/deviceClass must be one of/);
  });

  it("rejects invalid frame target bounds", () => {
    expect(() =>
      negotiateFrameTarget({
        minimumFrameRate: 90,
        maximumFrameRate: 60,
      })
    ).toThrow(/maximumFrameRate must be greater than or equal to minimumFrameRate/);
  });
});

it('uses explicit host frame headroom without changing the cadence target or defaults',()=>{
 const base={minimumFrameRate:24,maximumFrameRate:24,preferredFrameRates:[24],supportedFrameRates:[24]};
 const target=negotiateFrameTarget({...base,frameBudgetRatio:.9});
 expect(target.targetFrameRate).toBe(24);
 expect(target.targetFrameTimeMs).toBeCloseTo(1000/24);
 expect(target.downgradeFrameTimeMs).toBeCloseTo(37.5);
 expect(target.upgradeFrameTimeMs).toBeCloseTo(37.5*.92);
 expect(negotiateFrameTarget(base).downgradeFrameTimeMs).toBeCloseTo((1000/24)*1.05);
 for(const frameBudgetRatio of [0,-1,1.1,NaN,Infinity,'1',null]){
  expect(()=>negotiateFrameTarget({...base,frameBudgetRatio:frameBudgetRatio as any})).toThrow(/frameBudgetRatio/);
 }
});
