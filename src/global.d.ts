// Ambient declarations so `tsc --noEmit` accepts CSS side-effect imports
// (Next.js handles these at build time via its own loaders).
declare module "*.css";
