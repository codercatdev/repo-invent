/**
 * Bridge to the TypeScript engine in `src/`.
 *
 * Next.js and the CLI share a single implementation for repository scanning,
 * gap diagnosis, schedule prescription, and the AWS Events REST & MCP clients.
 */
export { scanForWeb, renderReportFor, type ScanResponse } from "@/src/scan";
export { servedCatalog, type ServedCatalog } from "@/src/catalog-cache";
export {
  addPersonalTime,
  cancelReservationById,
  endSignIn,
  favoriteSession,
  listAllEvents,
  mySchedule,
  removePersonalTime,
  reserveSession,
  sessionStatus,
  startSignIn,
  unfavoriteSession,
  type MySchedule,
  type SessionStatus,
} from "@/src/session";
export {
  RemoteMcpBridge,
  REMOTE_MCP_URL,
  type RemoteTool,
  type RemoteToolResult,
} from "@/src/api/remote-mcp-bridge";
export { whatCanIMake } from "@/src/solver/candidates";
export { parseReflections } from "@/src/reflect";
export { VenueTransit } from "@/src/solver/transit-guard";
export type { EventSummary } from "@/src/api/events-client";
export type {
  ArchitecturalGap,
  Catalog,
  ReinventSession,
  StackFingerprint,
} from "@/src/types";
