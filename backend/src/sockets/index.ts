import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
// `cookie` v2 is ESM-only and renamed its export: `parse` is now `parseCookie`, with no default.
import { parseCookie } from 'cookie';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { verifyAccessToken } from '../utils/jwt.js';

export interface SocketUser {
  id: string;
  role: string;
  shelterId?: string;
}

let io: Server | null = null;

/** Rooms. Everything is addressed by these rather than by socket id, which changes per connection. */
export const room = {
  user: (userId: string) => `user:${userId}`,
  shelter: (shelterId: string) => `shelter:${shelterId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  /** A single shared room for administrators — the live security-monitoring feed. */
  admin: () => 'admins',
};

/**
 * Attaches Socket.io to the existing HTTP server.
 *
 * Sharing the server is the whole reason this is possible: the WebSocket upgrade carries the same
 * cookies as a normal request, so the session works without a second auth mechanism.
 */
export function attachSockets(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.allowedOrigins,
      credentials: true,
    },
    // Long-poll fallback first, then upgrade — some corporate proxies block raw WebSocket.
    transports: ['polling', 'websocket'],
  });

  /**
   * Handshake authentication.
   *
   * Rejecting here rather than after connecting matters: an unauthenticated socket must never
   * reach the point where it could ask to join a room.
   */
  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.cookie;
      if (!header) return next(new Error('UNAUTHENTICATED'));

      const token = parseCookie(header)[ACCESS_COOKIE];
      if (!token) return next(new Error('UNAUTHENTICATED'));

      const payload = verifyAccessToken(token);

      // Same tokenVersion check as the HTTP middleware, so a banned user or a revoked role cannot
      // hold a live socket open past the change.
      const user = await User.findOne({ _id: payload.sub, deletedAt: null })
        .select('role status tokenVersion shelterId')
        .lean();

      if (!user) return next(new Error('UNAUTHENTICATED'));
      if (user.tokenVersion !== payload.tokenVersion) return next(new Error('UNAUTHENTICATED'));
      if (user.status !== 'active') return next(new Error('FORBIDDEN'));

      socket.data.user = {
        id: String(user._id),
        role: user.role,
        ...(user.shelterId ? { shelterId: String(user.shelterId) } : {}),
      } satisfies SocketUser;

      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as SocketUser;

    /**
     * Rooms are joined by the SERVER from the authenticated session, never on client request.
     * If clients could ask to join `user:<id>`, anyone could subscribe to anyone else's
     * notifications simply by naming their id.
     */
    void socket.join(room.user(user.id));
    if (user.shelterId) void socket.join(room.shelter(user.shelterId));
    // Admins additionally join the shared admin room for the live security feed. Derived from the
    // authenticated role, never from a client request — the same rule as every other room.
    if (user.role === 'admin') void socket.join(room.admin());

    logger.debug({ userId: user.id, socketId: socket.id }, 'Socket connected');

    /**
     * Conversation rooms are the ONE case a client may ask to join, because thread membership is
     * data the server has to look up rather than derive from the session.
     *
     * Every join is therefore checked against the database first. Personal rooms (`user:<id>`)
     * still have no join handler at all — they are derived from the session above and must stay
     * that way.
     */
    socket.on('conversation:join', async (conversationId: unknown, ack?: (ok: boolean) => void) => {
      if (typeof conversationId !== 'string') {
        ack?.(false);
        return;
      }

      try {
        const isParticipant = await Conversation.exists({
          _id: conversationId,
          participants: user.id,
        });

        if (!isParticipant) {
          logger.warn(
            { userId: user.id, conversationId },
            'Rejected socket join for a conversation the user is not part of',
          );
          ack?.(false);
          return;
        }

        await socket.join(room.conversation(conversationId));
        ack?.(true);
      } catch (error) {
        logger.error({ err: error, userId: user.id }, 'conversation:join failed');
        ack?.(false);
      }
    });

    socket.on('conversation:leave', (conversationId: unknown) => {
      if (typeof conversationId === 'string') {
        void socket.leave(room.conversation(conversationId));
      }
    });

    /**
     * Typing indicators are ephemeral and never persisted.
     *
     * Re-checked against the room membership rather than trusted: a socket that never joined
     * cannot broadcast into a thread it is not part of.
     */
    socket.on('typing', (payload: unknown) => {
      const { conversationId, isTyping } = (payload ?? {}) as {
        conversationId?: string;
        isTyping?: boolean;
      };
      if (typeof conversationId !== 'string') return;
      if (!socket.rooms.has(room.conversation(conversationId))) return;

      // broadcast → everyone in the room except the sender.
      socket.broadcast.to(room.conversation(conversationId)).emit('typing', {
        conversationId,
        userId: user.id,
        isTyping: Boolean(isTyping),
      });
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ userId: user.id, reason }, 'Socket disconnected');
    });
  });

  logger.info('Socket.io attached.');
  return io;
}

export function getIo(): Server | null {
  return io;
}

/**
 * Emits to a room if sockets are running.
 *
 * Never throws: realtime delivery is an enhancement on top of the persisted notification, and a
 * socket problem must not fail the action that triggered it.
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  try {
    io?.to(room.user(userId)).emit(event, payload);
  } catch (error) {
    logger.error({ err: error, userId, event }, 'Failed to emit socket event');
  }
}

export function emitToShelter(shelterId: string, event: string, payload: unknown): void {
  try {
    io?.to(room.shelter(shelterId)).emit(event, payload);
  } catch (error) {
    logger.error({ err: error, shelterId, event }, 'Failed to emit socket event');
  }
}

/** Broadcasts to every connected administrator — the live security monitor. */
export function emitToAdmins(event: string, payload: unknown): void {
  try {
    io?.to(room.admin()).emit(event, payload);
  } catch (error) {
    logger.error({ err: error, event }, 'Failed to emit admin socket event');
  }
}

export async function closeSockets(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
