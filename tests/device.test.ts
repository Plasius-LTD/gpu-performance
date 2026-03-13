import { describe, expect, it } from "vitest";

import { createDeviceProfile, negotiateFrameTarget } from "../src/index.js";

describe("device profile", () => {
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
