'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './JoinRoom.module.css';
import Link from 'next/link';
import { registerGuest, createRoom, joinRoomByCode, persistPlayerSession } from '@/lib/api';

const AVATARS = ['🎭', '🃏', '🔫', '🕵️', '💊', '👁️', '🗡️', '🎩', '🦊', '🐍', '🌙', '💀'];

export default function JoinRoom() {
  const router = useRouter();
  const [name, setName]       = useState('');
  const [code, setCode]       = useState('');
  const [avatar, setAvatar]   = useState('🎭');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const validate = (needCode) => {
    if (!name.trim()) { setError('Enter your name'); return false; }
    if (name.trim().length < 2) { setError('Name must be at least 2 characters'); return false; }
    if (needCode && code.trim().length < 4) { setError('Enter a valid room code'); return false; }
    setError(''); return true;
  };

  const handleCreate = async () => {
    if (!validate(false)) return;
    setLoading(true); setError('');
    try {
      const auth = await registerGuest(name.trim());
      const room = await createRoom(15);
      persistPlayerSession({
        name: name.trim(),
        username: auth.username,
        code: room.code,
        isHost: true,
        avatar,
        userId: auth.userId,
        roomId: room.id,
        token: auth.accessToken,
      });
      router.push('/room');
    } catch (err) {
      setError(err.message || 'Could not create room. Try again.');
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!validate(true)) return;
    setLoading(true); setError('');
    try {
      const auth = await registerGuest(name.trim());
      const player = await joinRoomByCode(code.toUpperCase());
      persistPlayerSession({
        name: name.trim(),
        username: auth.username,
        code: code.toUpperCase(),
        isHost: false,
        avatar,
        userId: auth.userId,
        playerId: player.id,
        roomId: player.roomId,
        token: auth.accessToken,
      });
      router.push('/room');
    } catch (err) {
      setError(err.message || 'Could not join room. Check the code.');
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.vignette} />
      <div className={styles.grain} />
      <span className={styles.cornerTL}>♠</span>
      <span className={styles.cornerBR}>♥</span>
      <Link href="/" className={styles.back}>← Back</Link>

      <div className={styles.wrapper}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelSuit}>♦</span>
            <h2 className={styles.panelTitle}>Join a Room</h2>
            <p className={styles.panelSub}>Have a code? Step inside.</p>
          </div>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Your Name</label>
              <input className={styles.input} type="text" placeholder="e.g. Don Corleone"
                value={name} onChange={e => setName(e.target.value)} maxLength={20} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Choose Avatar</label>
              <div className={styles.avatarGrid}>
                {AVATARS.map(a => (
                  <button key={a}
                    className={`${styles.avatarBtn} ${avatar === a ? styles.avatarActive : ''}`}
                    onClick={() => setAvatar(a)} type="button">{a}</button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Room Code</label>
              <input className={`${styles.input} ${styles.codeInput}`} type="text"
                placeholder="e.g. XK92TF" value={code}
                onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8}
                onKeyDown={e => e.key === 'Enter' && handleJoin()} />
            </div>
            {error && <p className={styles.error}>⚠ {error}</p>}
            <button className={`${styles.joinBtn} ${loading ? styles.loading : ''}`}
              onClick={handleJoin} disabled={loading}>
              {loading ? <span className={styles.spinner} />
                : <><span>Enter Room</span><span className={styles.arrow}>→</span></>}
            </button>
          </div>
        </div>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerOr}>or</span>
          <span className={styles.dividerLine} />
        </div>

        <div className={`${styles.panel} ${styles.panelCreate}`}>
          <div className={styles.panelHeader}>
            <span className={styles.panelSuit}>♣</span>
            <h2 className={styles.panelTitle}>Create a Room</h2>
            <p className={styles.panelSub}>Be the host. Run the city.</p>
          </div>
          <div className={styles.createBody}>
            <div className={styles.createPerks}>
              <div className={styles.perk}><span>🎙</span><span>You control game phases</span></div>
              <div className={styles.perk}><span>👥</span><span>Up to 15 players</span></div>
              <div className={styles.perk}><span>🤖</span><span>AI host guides the game</span></div>
            </div>
            {error && <p className={styles.error}>⚠ {error}</p>}
            <button className={`${styles.createBtn} ${loading ? styles.loading : ''}`}
              onClick={handleCreate} disabled={loading}>
              {loading ? <span className={styles.spinner} />
                : <><span>Create & Enter</span><span className={styles.arrow}>⊕</span></>}
            </button>
          </div>
          <p className={styles.note}>Name & avatar apply to both options</p>
        </div>
      </div>
    </div>
  );
}
