// lib/useSocket.js  — React hook для Socket.io подключения
'use client';

import { useEffect, useRef, useCallback } from 'react';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002';

export function useSocket(token, handlers = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    // Динамический импорт socket.io-client (не включён пока — установим)
    let socket;
    import('socket.io-client').then(({ io }) => {
      socket = io(`${SOCKET_URL}/game`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current = socket;

      // ── bind handlers ──
      socket.on('connect', () => {
        console.log('🔌 Socket connected:', socket.id);
        handlers.onConnect?.();
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        handlers.onDisconnect?.();
      });

      socket.on('error', (data) => {
        console.error('Socket error:', data);
        handlers.onError?.(data);
      });

      socket.on('room_joined',        handlers.onRoomJoined);
      socket.on('player_joined',      handlers.onPlayerJoined);
      socket.on('player_left',        handlers.onPlayerLeft);
      socket.on('game_started',       handlers.onGameStarted);
      socket.on('your_role',          handlers.onYourRole);
      socket.on('phase_changed',      handlers.onPhaseChanged);
      socket.on('vote_cast',          handlers.onVoteCast);
      socket.on('player_eliminated',  handlers.onPlayerEliminated);
      socket.on('game_over',          handlers.onGameOver);
      socket.on('chat_message',       handlers.onChatMessage);
      socket.on('ai_narration',       handlers.onAiNarration);
      socket.on('ready_update',       handlers.onReadyUpdate);
    });

    return () => {
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── emit helpers ──────────────────────────────────────────────────────────

  const joinRoom = useCallback((roomCode) => {
    socketRef.current?.emit('join_room', { roomCode });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leave_room');
  }, []);

  const sendMessage = useCallback((text) => {
    socketRef.current?.emit('send_message', { text });
  }, []);

  const setReady = useCallback(() => {
    socketRef.current?.emit('player_ready');
  }, []);

  const sendVote = useCallback((voterId, targetId) => {
    socketRef.current?.emit('cast_vote', { voterId, targetId });
  }, []);

  const requestAiNarration = useCallback((prompt) => {
    socketRef.current?.emit('request_ai_narration', { prompt });
  }, []);

  const isConnected = useCallback(() => {
    return socketRef.current?.connected ?? false;
  }, []);

  return {
    joinRoom,
    leaveRoom,
    sendMessage,
    setReady,
    sendVote,
    requestAiNarration,
    isConnected,
    socket: socketRef,
  };
}
