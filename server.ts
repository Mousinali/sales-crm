// ES module evaluation runs every statically-imported module to completion
// BEFORE any of this file's own top-level code — regardless of where that
// code is textually placed relative to the import statements. So a plain
// `import { config } from "dotenv"; config(...)` followed by
// `import ... from "@/lib/auth/session"` does NOT load env vars in time:
// session.ts (a static import) already finished evaluating — freezing its
// `SESSION_COOKIE_NAME` const as `undefined` — before `config(...)` ever
// runs. Route Handlers never hit this, since Next loads them lazily
// per-request, well after `app.prepare()` has loaded `.env.local`; this
// file's own top-level project imports do not have that luxury.
// Fix: only statically import packages that don't read our env vars
// (dotenv, http, next, socket.io), call `config()`, THEN dynamically
// `await import(...)` our own modules — exactly how `scripts/migrate.ts`
// and `scripts/seed-super-admin.ts` already load `@/lib/db` etc.
import { config } from "dotenv";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

config({ path: ".env.local" });

const { pool } = await import("@/lib/db");
const { getSessionUser, sessionTokenFromCookieHeader } = await import("@/lib/auth/session");
const { sendMessage, markDelivered } = await import("@/lib/chat/crud");
const { ChatRecipientNotFoundError, ChatMessageNotFoundError } = await import("@/lib/chat/errors");
const { recordNotification } = await import("@/lib/notifications/record");
const { setIO } = await import("@/lib/socket");

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const app = next({ dev });
const handle = app.getRequestHandler();

type SocketUser = { id: number; name: string };

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, {
    // The session cookie is `sameSite: "lax"`, which already stops a
    // cross-site page's script from attaching it to a WebSocket handshake —
    // but that protection is implicit in cookie policy, not in this server.
    // Reject the handshake outright if its Origin doesn't match the host
    // this request actually came in on, so Cross-Site WebSocket Hijacking
    // is blocked here too, explicitly, regardless of cookie config.
    //
    // A same-origin request (plain GET polling probes especially) often has
    // no Origin header at all — that's normal browser behavior, not an
    // attack signal, so it's let through. The actual CSWSH attack a
    // cross-site page mounts always carries an Origin header (browsers
    // attach it to every cross-origin request), so checking "if present, it
    // must match" still catches every real attack while not breaking
    // legitimate same-origin connections that omit it.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) {
        callback(null, true);
        return;
      }
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        callback(null, false);
        return;
      }
      callback(null, originHost === req.headers.host);
    },
  });
  setIO(io);

  // Groups newly-delivered rows by sender and pushes one "messages:delivered"
  // per sender's room, so each sender's open chat updates its ticks live
  // instead of waiting for a reload.
  function notifyDelivered(rows: { id: number; sender_id: number }[]): void {
    const idsBySender = new Map<number, number[]>();
    for (const row of rows) {
      const ids = idsBySender.get(row.sender_id) ?? [];
      ids.push(row.id);
      idsBySender.set(row.sender_id, ids);
    }
    for (const [senderId, ids] of idsBySender) {
      io.to(`user:${senderId}`).emit("messages:delivered", { ids });
    }
  }

  // Reuses the same session-cookie scheme as every Route Handler
  // (`sessionTokenFromCookieHeader` + `getSessionUser`) — a socket is just
  // another transport for the same signed-in session, not a separate auth
  // system.
  io.use(async (socket, next) => {
    const token = sessionTokenFromCookieHeader(socket.handshake.headers.cookie ?? "");
    const user = token ? await getSessionUser(token) : null;
    if (!user || user.must_change_password) {
      next(new Error("Unauthorized"));
      return;
    }
    socket.data.user = { id: user.id, name: user.name } satisfies SocketUser;
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as SocketUser;
    // A per-user room (not per-socket) so delivery reaches every tab/device
    // the user has open, and so the sender's other tabs also see their own
    // just-sent message.
    socket.join(`user:${user.id}`);

    // Catches up any message sent while this user was offline — otherwise
    // it would stay a single tick (sent, never delivered) until they
    // happened to open that specific conversation.
    void markDelivered(pool, { recipientId: user.id }).then(notifyDelivered);

    socket.on(
      "message:send",
      async (
        payload: { recipientId: number; body: string; replyToMessageId?: number },
        ack?: (response: unknown) => void,
      ) => {
        const recipientId = Number(payload?.recipientId);
        const body = typeof payload?.body === "string" ? payload.body.trim() : "";
        const replyToMessageId = Number.isInteger(payload?.replyToMessageId) ? payload.replyToMessageId : undefined;
        if (!Number.isInteger(recipientId) || !body) {
          ack?.({ error: "Invalid message" });
          return;
        }

        try {
          let message = await sendMessage(pool, { senderId: user.id, recipientId, body, replyToMessageId });
          await recordNotification(pool, {
            recipientUserId: recipientId,
            type: "CHAT_MESSAGE",
            relatedUserId: user.id,
            message: `${user.name} sent you a message`,
          });

          // The recipient's bell/chat socket is already connected (even if
          // they're not on this conversation) — mark it delivered right
          // away instead of waiting for their next reconnect to catch up.
          const recipientOnline = (await io.in(`user:${recipientId}`).fetchSockets()).length > 0;
          if (recipientOnline) {
            const delivered = await markDelivered(pool, { recipientId });
            if (delivered.some((row) => row.id === message.id)) {
              message = { ...message, delivered_at: new Date() };
            }
          }

          io.to(`user:${user.id}`).to(`user:${recipientId}`).emit("message:new", message);
          ack?.({ message });
        } catch (error) {
          const errorMessage =
            error instanceof ChatRecipientNotFoundError || error instanceof ChatMessageNotFoundError
              ? error.message
              : "Could not send message";
          ack?.({ error: errorMessage });
        }
      },
    );
  });

  // Lets Next's own dev-mode HMR websocket keep working alongside
  // Socket.IO on the same HTTP server — each checks the upgrade request's
  // path and ignores requests it doesn't own.
  httpServer.on("upgrade", app.getUpgradeHandler());

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
