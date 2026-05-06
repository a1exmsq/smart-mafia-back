import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.topLine} />
      <div className={styles.container}>
        <div className={styles.left}>
          <span className={styles.logo}>
            <span className={styles.logoIcon}>♠</span>
            SMART MAFIA
          </span>
          <p className={styles.tagline}>
            The city never sleeps. Neither does the AI.
          </p>
        </div>

        <div className={styles.center}>
          <div className={styles.suits}>♠ ♦ ♣ ♥</div>
        </div>

        <div className={styles.right}>
          <p className={styles.project}>
            Projekt Zespołowy · BIAWC
          </p>
          <p className={styles.year}>© 2025 Smart Mafia Team</p>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>Built with Vibe Coding · OpenAI · Next.js · Socket.io</span>
      </div>
    </footer>
  );
}
