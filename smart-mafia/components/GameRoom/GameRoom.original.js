'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './GameRoom.module.css';
import Link from 'next/link';

const ROLES = ['Mafia', 'Mafia', 'Detective', 'Doctor', 'Citizen', 'Citizen', 'Citizen'];

const MOCK_PLAYERS_INIT = [
  { id: 1, name: 'Don Corleone', avatar: '🎩', status: 'alive' },
  { id: 2, name: 'Michael',      avatar: '🔫', status: 'alive' },
  { id: 3, name: 'Sonny',        avatar: '🦊', status: 'eliminated' },
  { id: 4, name: 'Tom Hagen',    avatar: '🕵️', status: 'alive' },
];

// Mock AI responses per phase
const AI_RESPONSES = {
  lobby: [
    "The night is young and the city holds its secrets. Gather around, strangers — tonight, someone among you is a killer.",
    "Welcome to the table. Names mean nothing here. Only loyalty... and deception.",
  ],
  start: [
    "The game begins. Roles have been dealt in silence. What you are — only you know. Choose wisely who to trust.",
    "Let the shadows fall. The Mafia moves in darkness. Citizens, your survival depends on reason — and on reading the room.",
  ],
  night: [
    "Night descends upon the city. The Mafia stirs, eyes open in the darkness. Their target is chosen.",
    "The streets are empty. Somewhere, a decision is being made. When dawn breaks, someone will not wake.",
    "Silence. The city sleeps — but not everyone. The Mafia whispers.",
  ],
  day: [
    "Morning. The city wakes to grim news. Someone has fallen. The living must now find the wolf among the sheep.",
    "Day breaks. Accusations will fly. Evidence is thin and trust thinner. Who among you wears a mask?",
    "The sun offers little comfort. Discuss. Argue. The truth is buried somewhere in your words.",
  ],
  vote: [
    "The time for talk is over. Cast your votes. The city demands justice — or perhaps makes its greatest mistake.",
    "All eyes turn to the accused. Democracy is a fragile thing in a city run by shadows. Vote.",
    "The jury speaks. May the guilty be found — and if not, may the innocent forgive you.",
  ],
  player: [
    "Interesting. The table takes note.",
    "Words can be weapons. Choose them carefully.",
    "The night remembers everything that is said here.",
    "An accusation, perhaps? The city listens.",
    "Careful. The Mafia watches who speaks loudest.",
  ],
};

function getMockResponse(phase, type = 'player') {
  const pool = AI_RESPONSES[type] || AI_RESPONSES.player;
  return pool[Math.floor(Math.random() * pool.length)];
}

function PhaseIcon({ phase }) {
  const map = { lobby: '🃏', night: '🌙', day: '☀️', vote: '⚖️' };
  return <span>{map[phase] || '🃏'}</span>;
}

const PHASE_ORDER = ['night', 'day', 'vote'];

export default function GameRoom() {
  const router = useRouter();
  const [player, setPlayer] = useState(null);
  const [phase, setPhase] = useState('lobby');
  const [players, setPlayers] = useState(MOCK_PLAYERS_INIT);
  const [role, setRole] = useState(null);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1, from: 'AI Host', type: 'host', time: now(),
      text: 'Welcome to Smart Mafia. Waiting for the host to start the game…',
    }
  ]);
  const [input, setInput] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  // Voting state
  const [votingOpen, setVotingOpen] = useState(false);
  const [myVote, setMyVote] = useState(null);
  const [votes, setVotes] = useState({}); // playerId -> count

  const chatEndRef = useRef(null);

  function now() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('mafia_player');
      if (stored) {
        const p = JSON.parse(stored);
        setPlayer(p);
        setPlayers(prev => {
          if (prev.find(pl => pl.name === p.name)) return prev;
          return [...prev, { id: Date.now(), name: p.name, avatar: p.avatar || '🎭', status: 'alive', isYou: true }];
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMsg = (from, text, type = 'host') => {
    setMessages(prev => [...prev, { id: Date.now(), from, text, type, time: now() }]);
  };

  const fakeAI = (phase, msgType = 'player') => {
    setAiThinking(true);
    setTimeout(() => {
      addMsg('AI Host', getMockResponse(phase, msgType), 'host');
      setAiThinking(false);
    }, 900 + Math.random() * 700);
  };

  const handleStartGame = () => {
    const assigned = ROLES[Math.floor(Math.random() * ROLES.length)];
    setRole(assigned);
    setGameStarted(true);
    setPhase('night');
    addMsg('System', 'The game has begun. Roles assigned. Check your card below.', 'system');
    fakeAI('start', 'start');
  };

  const handleNextPhase = () => {
    setVotingOpen(false);
    setMyVote(null);
    const idx = PHASE_ORDER.indexOf(phase);
    const next = PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
    setPhase(next);
    if (next === 'vote') setVotingOpen(true);
    addMsg('System', `Phase changed to: ${next.toUpperCase()}`, 'system');
    fakeAI(next, next);
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || aiThinking) return;
    setInput('');
    addMsg(player?.name || 'You', msg, 'player');
    fakeAI(phase, 'player');
  };

  const handleVote = (targetId) => {
    if (myVote) return; // already voted
    setMyVote(targetId);
    setVotes(prev => ({ ...prev, [targetId]: (prev[targetId] || 0) + 1 }));
    addMsg('System', `${player?.name || 'You'} cast their vote.`, 'system');
    fakeAI('vote', 'vote');
  };

  const handleEliminate = () => {
    const topId = Object.entries(votes).sort((a,b) => b[1]-a[1])[0]?.[0];
    if (!topId) return;
    const target = players.find(p => p.id === Number(topId));
    if (!target) return;
    setPlayers(prev => prev.map(p => p.id === Number(topId) ? { ...p, status: 'eliminated' } : p));
    addMsg('System', `${target.name} has been eliminated by the city.`, 'system');
    setVotingOpen(false);
    setVotes({});
    setMyVote(null);
    fakeAI('day', 'day');
  };

  const isHost = player?.isHost;
  const alivePlayers = players.filter(p => p.status === 'alive');

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      {/* ── Top Bar ── */}
      <header className={styles.topBar}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>♠</span>
          <span>SMART MAFIA</span>
        </Link>
        <div className={styles.roomInfo}>
          <span className={styles.roomLabel}>Room</span>
          <span className={styles.roomCode}>{player?.code || '······'}</span>
        </div>
        <div className={styles.phaseDisplay}>
          <PhaseIcon phase={phase} />
          <span className={styles.phaseText}>
            {{ lobby: 'Lobby', night: 'Night Phase', day: 'Day Phase', vote: 'Voting' }[phase]}
          </span>
        </div>
      </header>

      <div className={styles.layout}>
        {/* ── Sidebar ── */}
        <aside className={styles.sidebar}>
          {/* Players */}
          <div className={styles.sideSection}>
            <h3 className={styles.sideTitle}>
              <span>Players</span>
              <span className={styles.sideCount}>{alivePlayers.length} alive</span>
            </h3>
            <ul className={styles.playerList}>
              {players.map(p => (
                <li key={p.id}
                  className={[
                    styles.playerItem,
                    p.status === 'eliminated' ? styles.eliminated : '',
                    p.isYou ? styles.youPlayer : '',
                    votingOpen && !myVote && p.status === 'alive' && !p.isYou ? styles.votable : '',
                  ].join(' ')}
                  onClick={() => votingOpen && !myVote && p.status === 'alive' && !p.isYou && handleVote(p.id)}
                >
                  <span className={styles.playerAvatar}>{p.avatar}</span>
                  <div className={styles.playerMeta}>
                    <span className={styles.playerName}>{p.name}{p.isYou ? ' (you)' : ''}</span>
                    <span className={styles.playerStatus}>
                      {p.status === 'eliminated'
                        ? '☠ Eliminated'
                        : votingOpen && !myVote && !p.isYou
                          ? '▸ Click to vote'
                          : votes[p.id] ? `${votes[p.id]} vote${votes[p.id] > 1 ? 's' : ''}` : '● Alive'}
                    </span>
                  </div>
                  {myVote === p.id && <span className={styles.myVoteMark}>✓</span>}
                </li>
              ))}
            </ul>
          </div>

          {/* Role card */}
          {gameStarted && (
            <div className={styles.sideSection}>
              <h3 className={styles.sideTitle}><span>Your Role</span></h3>
              <div className={styles.roleCard}>
                {roleRevealed ? (
                  <div className={`${styles.roleReveal} ${styles['role_' + role]}`}>
                    <span className={styles.roleIcon}>
                      {{ Mafia: '🔫', Detective: '🔍', Doctor: '💊', Citizen: '👤' }[role]}
                    </span>
                    <span className={styles.roleName}>{role}</span>
                    <span className={styles.roleDesc}>
                      {{ Mafia: 'Eliminate citizens at night.', Detective: 'Investigate one player each night.', Doctor: 'Save one player each night.', Citizen: 'Find and vote out the Mafia.' }[role]}
                    </span>
                  </div>
                ) : (
                  <button className={styles.revealBtn} onClick={() => setRoleRevealed(true)}>
                    <span>🂠</span> Tap to reveal role
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Host controls */}
          {isHost && (
            <div className={styles.sideSection}>
              <h3 className={styles.sideTitle}><span>Host Controls</span></h3>
              <div className={styles.hostControls}>
                {!gameStarted ? (
                  <button className={styles.startBtn} onClick={handleStartGame}>
                    ▶ Start Game
                  </button>
                ) : (
                  <>
                    <button className={styles.nextBtn} onClick={handleNextPhase}>
                      Next Phase →
                    </button>
                    {votingOpen && Object.keys(votes).length > 0 && (
                      <button className={styles.eliminateBtn} onClick={handleEliminate}>
                        ☠ Eliminate Top Vote
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Voting banner (non-host) */}
          {votingOpen && !isHost && (
            <div className={styles.voteBanner}>
              <span className={styles.voteBannerIcon}>⚖️</span>
              <p>{myVote ? 'Vote cast. Awaiting results.' : 'Click a player to cast your vote.'}</p>
            </div>
          )}
        </aside>

        {/* ── Chat ── */}
        <main className={styles.chatArea}>
          {/* Voting overlay bar */}
          {votingOpen && (
            <div className={styles.voteBar}>
              <span>⚖️</span>
              <span>Voting is open — {myVote ? 'your vote is cast.' : 'select a player from the left panel.'}</span>
            </div>
          )}

          <div className={styles.chatMessages}>
            {messages.map(msg => (
              <div key={msg.id} className={`${styles.message} ${styles['msg_' + msg.type]}`}>
                {msg.type !== 'system' && (
                  <div className={styles.msgHeader}>
                    <span className={styles.msgFrom}>{msg.from}</span>
                    <span className={styles.msgTime}>{msg.time}</span>
                  </div>
                )}
                <p className={styles.msgText}>{msg.text}</p>
              </div>
            ))}
            {aiThinking && (
              <div className={`${styles.message} ${styles.msg_host}`}>
                <div className={styles.msgHeader}>
                  <span className={styles.msgFrom}>AI Host</span>
                </div>
                <div className={styles.thinkingDots}>
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className={styles.chatInput}>
            <input
              className={styles.chatField}
              type="text"
              placeholder={aiThinking ? 'The host is speaking…' : 'Say something to the table…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              disabled={aiThinking}
            />
            <button className={styles.sendBtn} onClick={handleSend} disabled={aiThinking || !input.trim()}>↑</button>
          </div>
        </main>
      </div>
    </div>
  );
}
