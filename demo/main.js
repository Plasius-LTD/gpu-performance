import { mountGpuShowcase } from "../../gpu-demo-viewer/shared/showcase-runtime.js";

const root = globalThis.document?.getElementById("app");
if (!root) {
  throw new Error("Performance demo root element was not found.");
}

await mountGpuShowcase({
  root,
  focus: "performance",
  packageName: "@plasius/gpu-performance",
  title: "Adaptive 3D Performance Governance",
  subtitle:
    "The governor now demonstrates quality shifts against a live 3D scene instead of a flat chart, so cloth, fluid, and lighting degradation read visually.",
});
