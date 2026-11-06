/**
 * The bridge to the engine.
 *
 * The scanning, planning and AWS Events code lives in `../src` and is covered by
 * 52 tests. This file is the only place the Next app reaches it, so the app has
 * one import surface and a rename inside the engine touches one file here.
 *
 * The engine is compiled to `../dist` by `npm run build` in the repo root; the
 * alias in `tsconfig.json` points at that output.
 */
export { scanForWeb, renderReportFor, type ScanResponse } from "../../dist/scan.js";
export { servedCatalog, type ServedCatalog } from "../../dist/catalog-cache.js";
export {
  addPersonalTime,
  endSignIn,
  favoriteSession,
  mySchedule,
  removePersonalTime,
  sessionStatus,
  startSignIn,
  unfavoriteSession,
  type MySchedule,
  type SessionStatus,
} from "../../dist/session.js";
export type {
  ArchitecturalGap,
  Catalog,
  ReinventSession,
  StackFingerprint,
} from "../../dist/types.js";
