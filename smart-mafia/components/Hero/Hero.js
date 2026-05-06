import Link from 'next/link';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      {/* Atmospheric background layers */}
      <div className={styles.grain} />
      <div className={styles.vignette} />
      <div className={styles.redGlow} />
      <div className={styles.gridLines} />

      {/* Decorative card suits */}
      <div className={styles.suitTL}>♠</div>
      <div className={styles.suitTR}>♦</div>
      <div className={styles.suitBL}>♣</div>
      <div className={styles.suitBR}>♥</div>

      <div className={styles.content}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          AI-Powered · Real-time · Voice Guided
        </div>

        <h1 className={styles.title}>
          <span className={styles.titleLine1}>SMART</span>
          <span className={styles.titleLine2}>MAFIA</span>
        </h1>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerIcon}>✦</span>
          <span className={styles.dividerLine} />
        </div>

        <p className={styles.subtitle}>
          The city sleeps. The Mafia never does.
          <br />
          <em>Your AI host never misses a lie.</em>
        </p>

        <div className={styles.actions}>
          <Link href="/join" className={styles.btnPrimary}>
            <span className={styles.btnIcon}>⊕</span>
            Create Room
          </Link>
          <Link href="/join" className={styles.btnSecondary}>
            <span className={styles.btnIcon}>→</span>
            Join Room
          </Link>
        </div>

        <p className={styles.caption}>
          No registration required · Up to 15 players
        </p>
      </div>

      <div className={styles.scrollHint}>
        <span className={styles.scrollText}>Scroll</span>
        <span className={styles.scrollLine} />
      </div>
    </section>
  );
}
