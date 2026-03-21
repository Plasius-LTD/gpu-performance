import {
  createDeviceProfile,
  createGpuPerformanceGovernor,
  createQualityLadderAdapter,
} from "../dist/index.js";
import { mountGpuShowcase as mountHarborShowcase } from "../node_modules/@plasius/gpu-shared/dist/index.js";

const root = globalThis.document?.getElementById("app");
if (!root) {
  throw new Error("Performance demo root element was not found.");
}

function createState() {
  const fluidDetail = createQualityLadderAdapter({
    id: "fluid-detail",
    domain: "geometry",
    levels: [
      { id: "low", config: { waveAmplitude: 0.44 }, estimatedCostMs: 0.8 },
      { id: "medium", config: { waveAmplitude: 0.62 }, estimatedCostMs: 1.3 },
      { id: "high", config: { waveAmplitude: 0.84 }, estimatedCostMs: 2.1 },
    ],
    initialLevel: "high",
  });
  const clothDetail = createQualityLadderAdapter({
    id: "cloth-detail",
    domain: "cloth",
    levels: [
      { id: "low", config: { flagMotion: 0.36 }, estimatedCostMs: 0.7 },
      { id: "medium", config: { flagMotion: 0.52 }, estimatedCostMs: 1.1 },
      { id: "high", config: { flagMotion: 0.74 }, estimatedCostMs: 1.8 },
    ],
    initialLevel: "high",
  });
  const lightingDetail = createQualityLadderAdapter({
    id: "lighting-detail",
    domain: "lighting",
    levels: [
      { id: "low", config: { reflectionStrength: 0.08, shadowAccent: 0.03 }, estimatedCostMs: 0.5 },
      { id: "medium", config: { reflectionStrength: 0.14, shadowAccent: 0.05 }, estimatedCostMs: 1.0 },
      { id: "high", config: { reflectionStrength: 0.22, shadowAccent: 0.09 }, estimatedCostMs: 1.7 },
    ],
    initialLevel: "high",
  });

  const governor = createGpuPerformanceGovernor({
    device: createDeviceProfile({
      deviceClass: "desktop",
      mode: "flat",
      refreshRateHz: 60,
      supportedFrameRates: [60, 90],
      supportsWebGpu: true,
    }),
    modules: [fluidDetail, clothDetail, lightingDetail],
    adaptation: {
      sampleWindowSize: 10,
      minimumSamplesBeforeAdjustment: 4,
      degradeCooldownFrames: 1,
      upgradeCooldownFrames: 4,
      minStableFramesForRecovery: 3,
    },
  });

  return {
    governor,
    fluidDetail,
    clothDetail,
    lightingDetail,
    decision: governor.recordFrame({ frameTimeMs: 16.3 }),
  };
}

function updateState(state, scene) {
  const syntheticFrameTime =
    14.8 +
    scene.sprays.length * 0.12 +
    scene.collisions * 0.02 +
    (scene.stress ? 8.6 : 0);
  state.decision = state.governor.recordFrame({ frameTimeMs: syntheticFrameTime });
  return state;
}

function describeState(state) {
  const fluidSnapshot = state.fluidDetail.getSnapshot();
  const clothSnapshot = state.clothDetail.getSnapshot();
  const lightingSnapshot = state.lightingDetail.getSnapshot();
  const decision = state.decision;
  const governorState = state.governor.getState();
  const degradedModuleCount = governorState.modules.filter((entry) => !entry.isAtMaximum).length;
  const target = state.governor.getTarget();

  return {
    status: `Governor live · ${decision.pressureLevel} · ${decision.metrics.fps.toFixed(1)} FPS`,
    details:
      `Quality drops hit fluid, cloth, and lighting visuals first while the ships and collision loop keep running at stable motion.`,
    sceneMetrics: [
      `fps: ${decision.metrics.fps.toFixed(1)}`,
      `frame avg: ${decision.metrics.averageFrameTimeMs.toFixed(2)} ms`,
      `pressure: ${decision.pressureLevel}`,
      `changes: ${decision.adjustments.length}`,
    ],
    qualityMetrics: [
      `fluid: ${fluidSnapshot.currentLevel.id}`,
      `cloth: ${clothSnapshot.currentLevel.id}`,
      `lighting: ${lightingSnapshot.currentLevel.id}`,
      `degraded modules: ${degradedModuleCount}`,
    ],
    debugMetrics: [
      `target frame time: ${target.targetFrameTimeMs.toFixed(2)} ms`,
      `downgrade threshold: ${target.downgradeFrameTimeMs.toFixed(2)} ms`,
      `upgrade threshold: ${target.upgradeFrameTimeMs.toFixed(2)} ms`,
      `adaptations recorded: ${decision.adjustments.length}`,
    ],
    notes: [
      "This demo now runs on the shared @plasius/gpu-shared harbor runtime instead of carrying its own local scene renderer copy.",
      "Stress mode drives the governor into degrade paths so the harbor visibly simplifies and then recovers.",
      "The ships keep colliding while cloth, reflections, and wave detail step down first.",
    ],
    textState: {
      pressureLevel: decision.pressureLevel,
      fps: Number(decision.metrics.fps.toFixed(2)),
      fluidLevel: fluidSnapshot.currentLevel.id,
      clothLevel: clothSnapshot.currentLevel.id,
      lightingLevel: lightingSnapshot.currentLevel.id,
    },
    visuals: {
      waveAmplitude: fluidSnapshot.currentLevel.config.waveAmplitude,
      flagMotion: clothSnapshot.currentLevel.config.flagMotion,
      reflectionStrength: lightingSnapshot.currentLevel.config.reflectionStrength,
      shadowAccent: lightingSnapshot.currentLevel.config.shadowAccent,
      skyTop: decision.pressureLevel === "stable" ? "#eef6fb" : "#e4edf2",
      skyMid: decision.pressureLevel === "stable" ? "#bfd3df" : "#b2c3cd",
      skyBottom: "#7ea2b5",
      seaTop: "#215066",
      seaMid: "#103a4e",
      seaBottom: "#082130",
      waterNear:
        fluidSnapshot.currentLevel.id === "high"
          ? { r: 0.14, g: 0.41, b: 0.51 }
          : fluidSnapshot.currentLevel.id === "medium"
            ? { r: 0.13, g: 0.36, b: 0.46 }
            : { r: 0.12, g: 0.32, b: 0.4 },
      waterFar: { r: 0.28, g: 0.52, b: 0.62 },
    },
  };
}

await mountHarborShowcase({
  root,
  packageName: "@plasius/gpu-performance",
  title: "Adaptive Performance in a 3D Harbor",
  subtitle:
    "Family-coordinated 3D validation for the frame governor, with visual degradation applied to waves, flag motion, and lighting before core ship motion changes.",
  createState,
  updateState,
  describeState,
});
