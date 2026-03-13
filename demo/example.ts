import {
  createDeviceProfile,
  createGpuPerformanceGovernor,
  createQualityLadderAdapter,
} from "../src/index.js";

const device = createDeviceProfile({
  deviceClass: "xr-headset",
  mode: "immersive-vr",
  refreshRateHz: 72,
  supportedFrameRates: [72, 90],
  supportsFoveation: true,
});

const renderScale = createQualityLadderAdapter({
  id: "render-scale",
  domain: "resolution",
  levels: [
    { id: "50", config: { scale: 0.5 }, estimatedCostMs: 1.2 },
    { id: "67", config: { scale: 0.67 }, estimatedCostMs: 2.1 },
    { id: "80", config: { scale: 0.8 }, estimatedCostMs: 3.2 },
    { id: "100", config: { scale: 1.0 }, estimatedCostMs: 4.8 },
  ],
  initialLevel: "100",
});

const shadows = createQualityLadderAdapter({
  id: "shadows",
  domain: "shadows",
  levels: [
    { id: "off", config: { enabled: false }, estimatedCostMs: 0.0 },
    { id: "hard", config: { enabled: true, cascades: 1 }, estimatedCostMs: 0.9 },
    { id: "soft", config: { enabled: true, cascades: 3 }, estimatedCostMs: 2.4 },
  ],
  initialLevel: "soft",
});

const particles = createQualityLadderAdapter({
  id: "particles",
  domain: "particles",
  levels: [
    { id: "low", config: { maxParticles: 1500 }, estimatedCostMs: 0.6 },
    { id: "medium", config: { maxParticles: 5000 }, estimatedCostMs: 1.4 },
    { id: "high", config: { maxParticles: 12000 }, estimatedCostMs: 2.8 },
  ],
  initialLevel: "high",
});

const physics = createQualityLadderAdapter({
  id: "physics",
  domain: "physics",
  authority: "authoritative",
  importance: "critical",
  levels: [{ id: "fixed", config: { tickHz: 60 }, estimatedCostMs: 2.5 }],
});

const governor = createGpuPerformanceGovernor({
  device,
  modules: [renderScale, shadows, particles, physics],
  adaptation: {
    sampleWindowSize: 8,
    minimumSamplesBeforeAdjustment: 4,
    degradeCooldownFrames: 1,
    upgradeCooldownFrames: 4,
    minStableFramesForRecovery: 3,
  },
});

const frameSeries = [
  12.9,
  13.4,
  14.1,
  17.8,
  18.2,
  18.7,
  19.1,
  18.4,
  13.2,
  12.8,
  12.6,
  12.4,
  12.2,
  12.1,
  12.0,
  11.9,
  11.8,
  11.7,
  11.6,
  11.5,
];

for (const frameTimeMs of frameSeries) {
  const decision = governor.recordFrame({ frameTimeMs });
  const summary = {
    frameTimeMs,
    pressure: decision.pressureLevel,
    fps: Number(decision.metrics.fps.toFixed(1)),
    adjustments: decision.adjustments.map((adjustment) => ({
      module: adjustment.moduleId,
      from: adjustment.fromLevelId,
      to: adjustment.toLevelId,
      direction: adjustment.direction,
    })),
  };

  console.log(summary);
}
