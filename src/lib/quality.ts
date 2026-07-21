import "server-only";

// Server entry point for the data-quality suite. The actual checks live in
// ./quality-core so `npm run validate:data` can run the exact same rules from
// the CLI — one implementation, two surfaces.
export type { DataQuality, QualityFlag, QualitySeverity, QualityCategory } from "./quality-core";
export { getDataQuality } from "./quality-core";
