import type { Server } from "socket.io";

// A process-wide handle to the Socket.IO server `server.ts` creates, so
// plain Next.js Route Handlers (which never see that `io` instance
// otherwise — it's local to server.ts's closure) can still push a live
// event to a user's room. Safe only because the custom server runs
// everything in one Node process; this would not work across multiple
// server instances/processes without a shared adapter (e.g. Redis).
let io: Server | null = null;

export function setIO(instance: Server): void {
  io = instance;
}

export function getIO(): Server | null {
  return io;
}
