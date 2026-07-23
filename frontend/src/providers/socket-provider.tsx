'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './auth-provider';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:5000';

/**
 * Owns the single socket connection for the whole app.
 *
 * Extracted from the notification provider in Batch 12: messaging also needs the socket, and two
 * providers each calling `io()` would open two connections per tab — doubling the server's socket
 * count and, worse, splitting room joins across connections so an event could arrive on the one
 * that is not listening.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);

  /**
   * One instance for the lifetime of the provider, created with `autoConnect: false`.
   *
   * Connecting is then something the effect *does to* an external system rather than something it
   * stores in state — no setState in the effect body, and consumers get a stable reference they
   * can subscribe to without re-subscribing every time the connection flaps.
   */
  const [socket] = useState<Socket>(() =>
    io(SOCKET_URL, {
      autoConnect: false,
      // The session cookie is httpOnly, so the browser must be told to send credentials with the
      // handshake — the server authenticates from that cookie alone.
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      // Backoff caps at 10s so a long outage does not turn into a retry storm on recovery.
      reconnectionDelayMax: 10_000,
    }),
  );

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  /**
   * Connect on sign-in, disconnect on sign-out.
   *
   * Keyed on the user id so switching accounts drops the connection and reconnects — the server
   * joins rooms from the handshake, so without this the previous user's rooms would stay joined
   * and their events would keep arriving.
   */
  useEffect(() => {
    if (!isAuthenticated || !user) {
      socket.disconnect();
      return;
    }

    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [socket, isAuthenticated, user, user?.id]);

  const value = useMemo<SocketContextValue>(() => ({ socket, connected }), [socket, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
