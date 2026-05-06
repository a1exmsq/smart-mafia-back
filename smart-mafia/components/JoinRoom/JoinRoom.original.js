'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './JoinRoom.module.css';
import Link from 'next/link';

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const AVATARS = ['🎭', '🃏', '🔫', '🕵️', '💊', '👁️', '🗡️', '🎩', '🦊', '🐍', '🌙', '💀'];

export default function JoinRoom() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [avatar, setAvatar] = useState('🎭');
  const [generatedCode] = useState(generateCode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = (needCode) => {
    if (!name.trim()) { setError('Enter your name'); return false; }
    if (needCode && code.trim().length < 4) { setError('Enter a valid room code (min 4 chars)'); return false; }
    setError('');
    return true;
  };

  const enter = (roomCode, isHost) => {
    setLoading(true);
    sessionStorage.setItem('mafia_player', JSON.stringify({
      name: name.trim(), code: roomCode, isHost, avatar,
    }));
    setTimeout(() => router.push('/room'), 500);
  };

  const handleJoin = () => { if (validate(true)) enter(code.toUpperCase(), false); };
  const handleCreate = () => { if (validate(false)) enter(generatedCode, true); };

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.vignette} />
      <div className={styles.grain} />
      <span className={styles.cornerTL}>♠</span>
      <span className={styles.cornerBR}>♥</span>

      <Link href="/" className={styles.back}>← Back</Link>

      <div className={styles.wrapper}>
        {/* ── Left: Join ── */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelSuit}>♦</span>
            <h2 className={styles.panelTitle}>Join a Room</h2>
            <p className={styles.panelSub}>Have a code? Step inside.</p>
          </div>

          <div className={styles.form}>
            {/* Name */}
            <div className={styles.field}>
              <label className={styles.label}>Your Name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Don Corleone"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={20}
              />
            </div>

            {/* Avatar picker */}
            <div className={styles.field}>
              <label className={styles.label}>Choose Avatar</label>
              <div className={styles.avatarGrid}>
                {AVATARS.map(a => (
                  <button
                    key={a}
                    className={`${styles.avatarBtn} ${avatar === a ? styles.avatarActive : ''}`}
                    onClick={() => setAvatar(a)}
                    type="button"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Room code */}
            <div className={styles.field}>
              <label className={styles.label}>Room Code</label>
              <input
                className={`${styles.input} ${styles.codeInput}`}
                type="text"
                placeholder="e.g. XK92TF"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
            </div>

            {error && <p className={styles.error}>⚠ {error}</p>}

            <button
              className={`${styles.joinBtn} ${loading ? styles.loading : ''}`}
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? <span className={styles.spinner} /> : <><span>Enter Room</span><span className={styles.arrow}>→</span></>}
            </button>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerOr}>or</span>
          <span className={styles.dividerLine} />
        </div>

        {/* ── Right: Create ── */}
        <div className={`${styles.panel} ${styles.panelCreate}`}>
          <div className={styles.panelHeader}>
            <span className={styles.panelSuit}>♣</span>
            <h2 className={styles.panelTitle}>Create a Room</h2>
            <p className={styles.panelSub}>Be the host. Run the city.</p>
          </div>

          <div className={styles.createBody}>
            <div className={styles.field}>
              <label className={styles.label}>Your Room Code</label>
              <div className={styles.generatedCode}>
                <span className={styles.codeDisplay}>{generatedCode}</span>
                <span className={styles.codeHint}>Share this with your players</span>
              </div>
            </div>

            <div className={styles.createPerks}>
              <div className={styles.perk}><span>🎙</span><span>You control game phases</span></div>
              <div className={styles.perk}><span>👥</span><span>Up to 15 players</span></div>
              <div className={styles.perk}><span>🤖</span><span>AI host guides the game</span></div>
            </div>

            {error && <p className={styles.error}>⚠ {error}</p>}

            <button
              className={`${styles.createBtn} ${loading ? styles.loading : ''}`}
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? <span className={styles.spinner} /> : <><span>Create & Enter</span><span className={styles.arrow}>⊕</span></>}
            </button>
          </div>

          <p className={styles.note}>Name & avatar apply to both options</p>
        </div>
      </div>
    </div>
  );
}
