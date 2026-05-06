'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import styles from './GameRoom.module.css';
import {
  advancePhase,
  clearPlayerSession,
  getGameState,
  getPlayersInRoom,
  loadPlayerSession,
  persistPlayerSession,
  resolveVotes,
  startRoom,
} from '@/lib/api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002';

const PHASE_LABELS = {
  lobby: 'Lobby',
  intro: 'Evening Introductions',
  night: 'Night Phase',
  day: 'Day Phase',
  voting: 'Voting',
  vote: 'Voting',
  game_over: 'Game Over',
};

const PHASE_ICONS = {
  lobby: '🎭',
  intro: '🌆',
  night: '🌙',
  day: '☀️',
  voting: '⚖️',
  vote: '⚖️',
  game_over: '🏆',
};

const PLAYER_AVATARS = ['🎭', '🎩', '🔫', '🕵️', '💉', '👁️', '🗡️', '🎩', '🦊', '🐍', '🌙', '💀'];

const NIGHT_ACTION_FOR_ROLE = {
  MAFIA: 'mafia_kill',
  DOCTOR: 'doctor_save',
  DETECTIVE: 'detective_check',
};

const NIGHT_PROMPT = {
  MAFIA: 'Choose who the Mafia should eliminate tonight.',
  DOCTOR: 'Choose who to save tonight.',
  DETECTIVE: 'Choose who to investigate tonight.',
};

const ROLE_ICONS = {
  MAFIA: '🔫',
  DETECTIVE: '🔎',
  DOCTOR: '💉',
  CIVILIAN: '👤',
};

const ROLE_DESCRIPTIONS = {
  MAFIA: 'Eliminate civilians at night.',
  DETECTIVE: 'Investigate one player each night.',
  DOCTOR: 'Save one player each night.',
  CIVILIAN: 'Find and vote out the Mafia.',
};

function PhaseIcon({ phase }) {
  return <span>{PHASE_ICONS[phase] || PHASE_ICONS.lobby}</span>;
}

function cleanName(username) {
  if (!username) return '?';
  const trimmed = username.trim();
  const withoutSuffix = trimmed.length > 4 ? trimmed.slice(0, -4).trim() : trimmed;
  return withoutSuffix || trimmed;
}

function buildVoteTotals(voteMap = {}) {
  return Object.values(voteMap).reduce((acc, targetId) => {
    if (!targetId) return acc;
    acc[targetId] = (acc[targetId] || 0) + 1;
    return acc;
  }, {});
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GameRoom() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [player, setPlayer] = useState(null);
  const [phase, setPhase] = useState('lobby');
  const [players, setPlayers] = useState([]);
  const [role, setRole] = useState(null);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [votingOpen, setVotingOpen] = useState(false);
  const [myVote, setMyVote] = useState(null);
  const [votes, setVotes] = useState({});
  const [nightActionDone, setNightActionDone] = useState(false);
  const [detectiveResults, setDetectiveResults] = useState({});
  const [runoffCandidates, setRunoffCandidates] = useState(null);
  const [finalRoles, setFinalRoles] = useState([]);
  const [nominations, setNominations] = useState({});
  const [speechTimer, setSpeechTimer] = useState(null);

  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const pollRef = useRef(null);
  const chatEndRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const avatarMapRef = useRef({});
  const lastWinnerRef = useRef(null);
  const timerPlayerId = speechTimer?.playerId;
  const timerInitialSeconds = speechTimer?.initialSeconds;

  const addMsg = useCallback((from, text, type = 'host') => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, from, text, type, time: formatTime() },
    ]);
  }, []);

  const refreshPlayers = useCallback(async (roomId, myUserId) => {
    try {
      const roomPlayers = await getPlayersInRoom(roomId);
      const myDisplayName = playerRef.current?.name;
      const me = roomPlayers.find((roomPlayer) => roomPlayer.userId === myUserId);

      if (me?.role) setRole((prev) => prev || me.role);

      setPlayers(
        roomPlayers.map((roomPlayer, index) => ({
          id: roomPlayer.id,
          userId: roomPlayer.userId,
          name:
            roomPlayer.userId === myUserId
              ? (myDisplayName || cleanName(roomPlayer.user?.username))
              : cleanName(roomPlayer.user?.username),
          avatar:
            roomPlayer.userId === myUserId
              ? (playerRef.current?.avatar || PLAYER_AVATARS[index % PLAYER_AVATARS.length])
              : (avatarMapRef.current[roomPlayer.userId] || PLAYER_AVATARS[index % PLAYER_AVATARS.length]),
          number: index + 1,
          status: roomPlayer.isAlive === false ? 'eliminated' : 'alive',
          isYou: roomPlayer.userId === myUserId,
          role: roomPlayer.role,
        })),
      );
    } catch (error) {
      console.error('refreshPlayers failed:', error?.message || error);
    }
  }, []);

  const applyGameState = useCallback((state) => {
    if (!state) return;

    const nextPhase = state.phase?.toLowerCase() || 'lobby';
    const snapshot = state.snapshot || {};
    const winner = snapshot.winner || null;

    setGameStarted(nextPhase !== 'lobby');
    setPhase(nextPhase);
    setVotingOpen(nextPhase === 'voting');
    setVotes(nextPhase === 'voting' ? buildVoteTotals(snapshot.votes || {}) : {});
    setMyVote(null);
    if (nextPhase === 'night') setNightActionDone(false);
    setRunoffCandidates(snapshot.isRunoff ? snapshot.runoffCandidates || [] : null);

    if (snapshot.finalRoles?.length) setFinalRoles(snapshot.finalRoles);

    if (winner && lastWinnerRef.current !== winner) {
      lastWinnerRef.current = winner;
      const winnerLabel = winner === 'CIVILIANS' ? 'Civilians' : 'Mafia';
      addMsg('AI Host', `Game over. ${winnerLabel} win.`, 'host');
    }
  }, [addMsg]);

  const loadGameState = useCallback(async (roomId) => {
    try {
      const state = await getGameState(roomId);
      applyGameState(state);
    } catch {
      // Ignore bootstrap errors here; socket events will still recover the UI.
    }
  }, [applyGameState]);

  const copyCode = useCallback(() => {
    const code = playerRef.current?.code;
    if (!code || !navigator?.clipboard) return;

    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return undefined;

    const stored = loadPlayerSession();

    if (!stored?.token) {
      router.push('/join');
      return undefined;
    }

    setPlayer(stored);
    playerRef.current = stored;
    addMsg('AI Host', 'Welcome to Smart Mafia. Waiting for the next twist in the room...', 'host');

    if (stored.roomId) {
      refreshPlayers(stored.roomId, stored.userId);
      loadGameState(stored.roomId);
    }

    pollRef.current = setInterval(() => {
      const currentPlayer = playerRef.current;
      if (currentPlayer?.roomId) {
        refreshPlayers(currentPlayer.roomId, currentPlayer.userId);
      }
    }, 4000);

    const socket = io(`${SOCKET_URL}/game`, {
      auth: { token: stored.token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const myAvatar = stored.avatar || '🎭';
      avatarMapRef.current[stored.userId] = myAvatar;
      socket.emit('join_room', { roomCode: stored.code, avatar: myAvatar });
    });

    socket.on('connect_error', (error) => {
      setConnected(false);
      addMsg('System', `Connection failed: ${error?.message || 'unknown error'}`, 'system');
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason !== 'io client disconnect') {
        addMsg('System', 'Connection lost. Reconnecting...', 'system');
      }
    });

    socket.on('error', (data) => {
      const message = data?.message || 'Unexpected socket error';

      if (message === 'session_expired') {
        addMsg('System', 'Session expired. Please join the room again.', 'system');
        clearPlayerSession();
        setTimeout(() => router.push('/join'), 1500);
        return;
      }

      setMyVote(null);
      setAiThinking(false);
      addMsg('System', message, 'system');
    });

    socket.on('room_joined', (data) => {
      if (data?.roomId) {
        const nextPlayer = { ...playerRef.current, roomId: data.roomId };
        playerRef.current = nextPlayer;
        setPlayer(nextPlayer);
        persistPlayerSession(nextPlayer);
        refreshPlayers(data.roomId, stored.userId);
        loadGameState(data.roomId);
      }
    });

    socket.on('player_joined', (data) => {
      if (data?.avatar && data?.userId) {
        avatarMapRef.current[data.userId] = data.avatar;
      }
      addMsg('System', `${cleanName(data?.username)} joined the room.`, 'system');
      if (playerRef.current?.roomId) {
        refreshPlayers(playerRef.current.roomId, stored.userId);
      }
    });

    socket.on('player_left', (data) => {
      addMsg('System', `${cleanName(data?.username)} disconnected.`, 'system');
      if (playerRef.current?.roomId) {
        refreshPlayers(playerRef.current.roomId, stored.userId);
      }
    });

    socket.on('game_started', (data) => {
      setGameStarted(true);
      setDetectiveResults({});
      setFinalRoles([]);
      applyGameState(data?.gameState);
      addMsg('System', 'Game started. Check your secret role.', 'system');
      if (playerRef.current?.roomId) {
        refreshPlayers(playerRef.current.roomId, stored.userId);
      }
    });

    socket.on('your_role', (data) => {
      if (data?.role) {
        setRole(data.role);
        setGameStarted(true);
      }
    });

    socket.on('ai_narration', (data) => {
      setAiThinking(false);
      if (data?.text) addMsg('AI Host', data.text, 'host');
    });

    socket.on('system_message', (data) => {
      if (data?.text) addMsg('System', data.text, 'system');
    });

    socket.on('phase_changed', (data) => {
      const nextPhase = data?.phase?.toLowerCase() || 'lobby';
      setPhase(nextPhase);
      setGameStarted(true);
      setVotingOpen(nextPhase === 'voting');

      if (nextPhase !== 'voting') {
        setMyVote(null);
        setVotes({});
        setRunoffCandidates(null);
      }
      if (nextPhase === 'night') {
        setNightActionDone(false);
        setNominations({});
        setSpeechTimer(null);
      }
      if (nextPhase === 'day') {
        setNominations({});
        setSpeechTimer(null);
      }

      addMsg('System', `Phase changed to ${data?.phase}. Round ${data?.round}.`, 'system');
      if (playerRef.current?.roomId) {
        refreshPlayers(playerRef.current.roomId, stored.userId);
      }
    });

    socket.on('vote_cast', (data) => {
      setVotes((prev) => ({ ...prev, [data.targetId]: (prev[data.targetId] || 0) + 1 }));
    });

    socket.on('player_eliminated', (data) => {
      setPlayers((prev) =>
        prev.map((roomPlayer) =>
          roomPlayer.id === data.playerId
            ? { ...roomPlayer, status: 'eliminated' }
            : roomPlayer,
        ),
      );
      addMsg('System', `${cleanName(data?.username)} was eliminated.`, 'system');
      if (playerRef.current?.roomId) {
        refreshPlayers(playerRef.current.roomId, stored.userId);
      }
    });

    socket.on('game_over', (data) => {
      if (data?.winner && lastWinnerRef.current !== data.winner) {
        lastWinnerRef.current = data.winner;
        const winnerLabel = data.winner === 'CIVILIANS' ? 'Civilians' : 'Mafia';
        addMsg('AI Host', `Game over. ${winnerLabel} win.`, 'host');
      }
      setPhase('game_over');
      setVotingOpen(false);
      setRunoffCandidates(null);
      if (data?.players?.length) setFinalRoles(data.players);
    });

    socket.on('night_action_confirmed', () => {
      setNightActionDone(true);
      addMsg('System', 'Your night action has been recorded.', 'system');
    });

    socket.on('detective_result', (data) => {
      if (data?.targetId && data?.result) {
        setDetectiveResults((prev) => ({ ...prev, [data.targetId]: data.result }));
      }
      addMsg(
        'System',
        `Investigation result for ${cleanName(data?.targetName)}: ${data?.result}`,
        'system',
      );
    });

    socket.on('mafia_vote_update', () => {
      addMsg('System', 'A Mafia vote has been updated.', 'system');
    });

    socket.on('runoff_vote', (data) => {
      setRunoffCandidates(data?.candidateIds || []);
      setMyVote(null);
      addMsg('System', `Runoff vote started between: ${data?.names}`, 'system');
    });

    socket.on('chat_message', (data) => {
      if (data?.userId !== playerRef.current?.userId) {
        addMsg(cleanName(data?.from), data?.text, 'player');
      }
    });

    socket.on('nomination_updated', (data) => {
      setNominations((prev) => {
        const next = { ...prev };
        if (data?.targetId) next[data.nominatorId] = data.targetId;
        else delete next[data.nominatorId];
        return next;
      });

      if (data?.targetId) {
        addMsg('System', `${cleanName(data?.nominatorName)} nominated a player for voting.`, 'system');
      } else {
        addMsg('System', `${cleanName(data?.nominatorName)} withdrew their nomination.`, 'system');
      }
    });

    socket.on('speech_timer_started', (data) => {
      setSpeechTimer({
        playerId: data.playerId,
        secondsLeft: data.seconds,
        initialSeconds: data.seconds,
      });
    });

    socket.on('speech_timer_stopped', () => {
      setSpeechTimer(null);
    });

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerIntervalRef.current);
      socket.disconnect();
    };
  }, [addMsg, applyGameState, loadGameState, mounted, refreshPlayers, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    clearInterval(timerIntervalRef.current);

    if (!timerPlayerId) return undefined;

    timerIntervalRef.current = setInterval(() => {
      setSpeechTimer((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          clearInterval(timerIntervalRef.current);
          addMsg('System', "Time's up.", 'system');
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timerIntervalRef.current);
  }, [addMsg, timerInitialSeconds, timerPlayerId]);

  const handleStartGame = async () => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer?.roomId) return;

    try {
      await startRoom(currentPlayer.roomId);
    } catch (error) {
      addMsg('System', `Could not start game: ${error.message}`, 'system');
    }
  };

  const handleNextPhase = async () => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer?.roomId) return;

    try {
      await advancePhase(currentPlayer.roomId);
    } catch (error) {
      addMsg('System', `Could not advance phase: ${error.message}`, 'system');
    }
  };

  const handleResolveVotes = async () => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer?.roomId) return;

    try {
      await resolveVotes(currentPlayer.roomId);
    } catch (error) {
      addMsg('System', `Could not resolve votes: ${error.message}`, 'system');
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (!socketRef.current?.connected) {
      addMsg('System', 'No active connection to the game room.', 'system');
      return;
    }

    setInput('');
    addMsg(playerRef.current?.name || 'You', text, 'player');
    socketRef.current.emit('send_message', { text });
  };

  const handleAskAI = () => {
    const text = input.trim();
    if (!text || !socketRef.current?.connected) return;

    setInput('');
    setAiThinking(true);
    socketRef.current.emit('request_ai_narration', { prompt: text });
  };

  const handleVote = (targetId) => {
    if (myVote) {
      addMsg('System', 'You have already voted this round.', 'system');
      return;
    }
    if (!socketRef.current?.connected) {
      addMsg('System', 'No active connection to the game room.', 'system');
      return;
    }

    setMyVote(targetId);
    socketRef.current.emit('cast_vote', { targetId });
    addMsg('System', 'Your vote has been cast.', 'system');
  };

  const handleNightAction = (targetId) => {
    if (nightActionDone) {
      addMsg('System', 'You have already acted this night.', 'system');
      return;
    }
    if (!role || !socketRef.current?.connected) return;

    const action = NIGHT_ACTION_FOR_ROLE[role];
    if (!action) return;

    socketRef.current.emit('night_action', { action, targetId });
    addMsg('System', 'Submitting your night action...', 'system');
  };

  const handleNominate = (targetId) => {
    if (!socketRef.current?.connected) return;
    const me = players.find((roomPlayer) => roomPlayer.isYou);
    if (!me || me.status !== 'alive') return;

    const alreadySelected = nominations[me.id] === targetId;
    socketRef.current.emit('nominate', { targetId: alreadySelected ? null : targetId });
  };

  const handleStartTimer = (targetId, seconds = 60) => {
    socketRef.current?.emit('start_speech_timer', { playerId: targetId, seconds });
  };

  const handleStopTimer = () => {
    socketRef.current?.emit('start_speech_timer', { playerId: '', stop: true });
  };

  const handleLeaveRoom = () => {
    socketRef.current?.emit('leave_room');
    clearPlayerSession();
    router.push('/');
  };

  if (!mounted) return null;

  const isHost = Boolean(player?.isHost);
  const alivePlayers = players.filter((roomPlayer) => roomPlayer.status === 'alive');
  const isNight = phase === 'night';
  const isDay = phase === 'day';
  const me = players.find((roomPlayer) => roomPlayer.isYou);
  const iAmAlive = me ? me.status === 'alive' : true;
  const myPlayerId = me?.id;
  const myNomination = myPlayerId ? nominations[myPlayerId] : null;
  const nominatedIds = [...new Set(Object.values(nominations))];
  const hasNightAction = isNight && iAmAlive && role && NIGHT_ACTION_FOR_ROLE[role] && !nightActionDone;
  const timerPlayer = speechTimer
    ? players.find((roomPlayer) => roomPlayer.id === speechTimer.playerId)
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <header className={styles.topBar}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>♠</span>
          <span>SMART MAFIA</span>
        </Link>

        <div className={styles.roomInfo}>
          <span className={styles.roomLabel}>Room</span>
          <span className={styles.roomCode}>{player?.code || '......'}</span>
          <button
            onClick={copyCode}
            style={{
              background: copied ? '#4ade80' : 'rgba(201,168,76,0.18)',
              border: '1px solid #C9A84C',
              borderRadius: '4px',
              color: copied ? '#111' : '#C9A84C',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '3px 8px',
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className={styles.phaseDisplay}>
          <PhaseIcon phase={phase} />
          <span className={styles.phaseText}>{PHASE_LABELS[phase] || phase}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: connected ? '#4ade80' : '#f87171', fontSize: '12px' }}>
            {connected ? 'Live' : 'Offline'}
          </span>
          {!connected && (
            <button
              onClick={() => socketRef.current?.connect()}
              style={{
                background: '#7c3aed',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '4px 8px',
              }}
            >
              Reconnect
            </button>
          )}
          <button
            onClick={handleLeaveRoom}
            style={{
              background: 'transparent',
              border: '1px solid #555',
              borderRadius: '4px',
              color: '#999',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '4px 8px',
            }}
          >
            Leave
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sideSection}>
            <h3 className={styles.sideTitle}>
              <span>Players</span>
              <span className={styles.sideCount}>{alivePlayers.length} alive</span>
            </h3>

            {players.length === 0 && (
              <p style={{ color: '#777', fontSize: '13px' }}>Waiting for players...</p>
            )}

            <ul className={styles.playerList}>
              {players.map((roomPlayer) => {
                const canVote =
                  votingOpen &&
                  iAmAlive &&
                  !myVote &&
                  roomPlayer.status === 'alive' &&
                  !roomPlayer.isYou &&
                  (!runoffCandidates || runoffCandidates.includes(roomPlayer.id)) &&
                  (nominatedIds.length === 0 || nominatedIds.includes(roomPlayer.id));

                const canNominate =
                  isDay &&
                  iAmAlive &&
                  roomPlayer.status === 'alive' &&
                  !roomPlayer.isYou;

                const canActAtNight =
                  hasNightAction &&
                  roomPlayer.status === 'alive' &&
                  (!roomPlayer.isYou || role === 'DOCTOR' || role === 'MAFIA');

                const isNominated = nominatedIds.includes(roomPlayer.id);
                const isMyNomination = myNomination === roomPlayer.id;

                return (
                  <li
                    key={roomPlayer.id}
                    className={[
                      styles.playerItem,
                      roomPlayer.status === 'eliminated' ? styles.eliminated : '',
                      roomPlayer.isYou ? styles.youPlayer : '',
                      canVote || canActAtNight ? styles.votable : '',
                      isNominated ? styles.nominated : '',
                    ].join(' ')}
                    onClick={() => {
                      if (canVote) handleVote(roomPlayer.id);
                      if (canActAtNight) handleNightAction(roomPlayer.id);
                    }}
                    style={speechTimer?.playerId === roomPlayer.id ? {
                      border: '2px solid #f59e0b',
                      boxShadow: '0 0 10px rgba(245,158,11,0.35)',
                    } : undefined}
                  >
                    <span
                      style={{
                        minWidth: '20px',
                        color: '#C9A84C',
                        fontSize: '13px',
                        fontWeight: '700',
                        textAlign: 'center',
                      }}
                    >
                      {roomPlayer.number}
                    </span>

                    <span className={styles.playerAvatar}>{roomPlayer.avatar}</span>

                    <div className={styles.playerMeta}>
                      <span className={styles.playerName}>
                        {roomPlayer.name}
                        {roomPlayer.isYou && (
                          <span
                            style={{
                              marginLeft: '6px',
                              padding: '1px 5px',
                              background: '#C9A84C',
                              borderRadius: '3px',
                              color: '#111',
                              fontSize: '9px',
                              fontWeight: '700',
                              letterSpacing: '0.08em',
                            }}
                          >
                            YOU
                          </span>
                        )}
                        {isNominated && <span style={{ marginLeft: '6px', color: '#f87171' }}>🎯</span>}
                        {role === 'DETECTIVE' && detectiveResults[roomPlayer.id] && !roomPlayer.isYou && (
                          <span
                            style={{
                              marginLeft: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                              color: detectiveResults[roomPlayer.id] === 'MAFIA' ? '#f87171' : '#4ade80',
                            }}
                          >
                            [{detectiveResults[roomPlayer.id]}]
                          </span>
                        )}
                      </span>

                      <span className={styles.playerStatus}>
                        {roomPlayer.status === 'eliminated' && 'Eliminated'}
                        {roomPlayer.status === 'alive' && canVote && 'Click to vote'}
                        {roomPlayer.status === 'alive' && !canVote && canActAtNight && 'Click to act'}
                        {roomPlayer.status === 'alive' && !canVote && !canActAtNight && votes[roomPlayer.id]
                          ? `${votes[roomPlayer.id]} vote(s)`
                          : roomPlayer.status === 'alive' && 'Alive'}
                      </span>
                    </div>

                    {myVote === roomPlayer.id && <span className={styles.myVoteMark}>✓</span>}

                    {canNominate && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleNominate(roomPlayer.id);
                        }}
                        className={styles.nominateBtn}
                        style={isMyNomination ? {
                          background: 'rgba(239, 68, 68, 0.22)',
                          borderColor: '#ef4444',
                          color: '#fff',
                        } : undefined}
                        title={isMyNomination ? 'Withdraw nomination' : 'Nominate for voting'}
                      >
                        {isMyNomination ? 'Remove' : 'Nominate'}
                      </button>
                    )}

                    {isHost && gameStarted && roomPlayer.status === 'alive' && phase !== 'night' && phase !== 'voting' && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStartTimer(roomPlayer.id, 60);
                        }}
                        className={styles.timerBtn}
                        title="Start 60-second speech timer"
                      >
                        Timer
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {role && (
            <div className={styles.sideSection}>
              <h3 className={styles.sideTitle}>
                <span>Your Role</span>
              </h3>

              <div className={styles.roleCard}>
                {roleRevealed ? (
                  <div className={styles.roleReveal}>
                    <span className={styles.roleIcon}>{ROLE_ICONS[role] || '🎭'}</span>
                    <span className={styles.roleName}>{role}</span>
                    <span className={styles.roleDesc}>{ROLE_DESCRIPTIONS[role] || ''}</span>
                  </div>
                ) : (
                  <button className={styles.revealBtn} onClick={() => setRoleRevealed(true)}>
                    Tap to reveal your role
                  </button>
                )}
              </div>
            </div>
          )}

          {isNight && iAmAlive && role && NIGHT_ACTION_FOR_ROLE[role] && (
            <div className={styles.sideSection}>
              <h3 className={styles.sideTitle}>
                <span>Night Action</span>
              </h3>

              <p style={{ color: nightActionDone ? '#4ade80' : '#C9A84C', fontSize: '13px' }}>
                {nightActionDone ? 'Action submitted. Waiting for the rest of the room.' : NIGHT_PROMPT[role]}
              </p>
            </div>
          )}

          {isHost && (
            <div className={styles.sideSection}>
              <h3 className={styles.sideTitle}>
                <span>Host Controls</span>
              </h3>

              <div className={styles.hostControls}>
                {!gameStarted ? (
                  <>
                    <p style={{ color: '#888', fontSize: '12px' }}>
                      {alivePlayers.length < 4
                        ? `Need ${4 - alivePlayers.length} more player(s) to start.`
                        : `${alivePlayers.length} players are ready.`}
                    </p>
                    <button
                      className={styles.startBtn}
                      onClick={handleStartGame}
                      disabled={alivePlayers.length < 4}
                      style={{
                        opacity: alivePlayers.length < 4 ? 0.5 : 1,
                        cursor: alivePlayers.length < 4 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Start Game
                    </button>
                  </>
                ) : (
                  <>
                    {phase === 'intro' && (
                      <p style={{ color: '#888', fontSize: '12px' }}>
                        Let the table introduce themselves, then move into the night.
                      </p>
                    )}

                    {isDay && nominatedIds.length > 0 && (
                      <div
                        style={{
                          padding: '8px',
                          border: '1px solid #7f1d1d',
                          borderRadius: '6px',
                          background: 'rgba(239,68,68,0.08)',
                          color: '#fca5a5',
                          fontSize: '12px',
                        }}
                      >
                        {nominatedIds.length} player(s) nominated for the vote.
                      </div>
                    )}

                    <button className={styles.nextBtn} onClick={handleNextPhase}>
                      Next Phase
                    </button>

                    {votingOpen && Object.keys(votes).length > 0 && (
                      <button className={styles.eliminateBtn} onClick={handleResolveVotes}>
                        Resolve Votes
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {votingOpen && !isHost && (
            <div className={styles.voteBanner}>
              <span className={styles.voteBannerIcon}>⚖️</span>
              <p>
                {myVote
                  ? 'Your vote is in. Waiting for the room to finish.'
                  : 'Click a player in the list to cast your vote.'}
              </p>
            </div>
          )}
        </aside>

        <main className={styles.chatArea}>
          {speechTimer && timerPlayer && (
            <div className={styles.timerOverlay}>
              <span className={styles.timerLabel}>Speaking Now</span>
              <span className={styles.timerName}>
                #{timerPlayer.number} {timerPlayer.name} - {speechTimer.secondsLeft}s
              </span>
              {isHost && (
                <button className={styles.timerStopBtn} onClick={handleStopTimer}>
                  Stop
                </button>
              )}
            </div>
          )}

          {phase === 'intro' && (
            <div className={styles.voteBar} style={{ borderColor: '#C9A84C', color: '#C9A84C' }}>
              <span>🌆</span>
              <span>Introduction phase. Let the city get to know every face at the table.</span>
            </div>
          )}

          {isNight && (
            <div className={styles.voteBar} style={{ borderColor: '#6366f1', color: '#a5b4fc' }}>
              <span>🌙</span>
              <span>
                {!iAmAlive
                  ? 'You are eliminated, so you can only watch the rest unfold.'
                  : hasNightAction
                    ? NIGHT_PROMPT[role]
                    : 'The city sleeps while the special roles act in secret.'}
              </span>
            </div>
          )}

          {isDay && (
            <div className={styles.voteBar} style={{ borderColor: '#f59e0b', color: '#fcd34d' }}>
              <span>☀️</span>
              <span>
                {nominatedIds.length === 0
                  ? 'Discuss and nominate suspects from the player list.'
                  : `${nominatedIds.length} player(s) have been nominated. The host can move to voting.`}
              </span>
            </div>
          )}

          {votingOpen && (
            <div className={styles.voteBar}>
              <span>⚖️</span>
              <span>
                {runoffCandidates?.length
                  ? 'Runoff vote in progress. Vote between the tied candidates.'
                  : 'Voting is open. Choose who should be eliminated.'}
              </span>
            </div>
          )}

          {phase === 'game_over' && finalRoles.length > 0 && (
            <div
              style={{
                margin: '16px 20px 0',
                padding: '18px',
                border: '1px solid #C9A84C',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(20,10,5,0.95), rgba(30,18,8,0.95))',
              }}
            >
              <h3 style={{ color: '#C9A84C', margin: '0 0 12px', textAlign: 'center' }}>
                Final Role Reveal
              </h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: '10px',
                }}
              >
                {finalRoles.map((finalPlayer) => (
                  <div
                    key={finalPlayer.id}
                    style={{
                      padding: '10px 8px',
                      border: '1px solid rgba(201,168,76,0.25)',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.04)',
                      opacity: finalPlayer.isAlive ? 1 : 0.6,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '26px' }}>{ROLE_ICONS[finalPlayer.role] || '🎭'}</div>
                    <div style={{ color: '#e5e7eb', fontSize: '12px', fontWeight: '600', marginTop: '6px' }}>
                      {cleanName(finalPlayer.username)}
                    </div>
                    <div style={{ color: '#C9A84C', fontSize: '10px', marginTop: '3px' }}>
                      {finalPlayer.role}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.chatMessages}>
            {messages.map((message) => (
              <div key={message.id} className={`${styles.message} ${styles[`msg_${message.type}`]}`}>
                {message.type !== 'system' && (
                  <div className={styles.msgHeader}>
                    <span className={styles.msgFrom}>{message.from}</span>
                    <span className={styles.msgTime}>{message.time}</span>
                  </div>
                )}
                <p className={styles.msgText}>{message.text}</p>
              </div>
            ))}

            {aiThinking && (
              <div className={`${styles.message} ${styles.msg_host}`}>
                <div className={styles.msgHeader}>
                  <span className={styles.msgFrom}>AI Host</span>
                </div>
                <div className={styles.thinkingDots}>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div className={styles.chatInput}>
            <input
              className={styles.chatField}
              type="text"
              placeholder={aiThinking ? 'AI host is thinking...' : 'Message the room...'}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSend();
              }}
            />

            <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim()}>
              ↑
            </button>

            {isHost && (
              <button
                onClick={handleAskAI}
                disabled={aiThinking || !input.trim()}
                title="Ask the AI narrator"
                style={{
                  background: aiThinking ? '#333' : 'rgba(124,58,237,0.7)',
                  border: '1px solid #7c3aed',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: aiThinking ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  padding: '0 12px',
                }}
              >
                AI
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
