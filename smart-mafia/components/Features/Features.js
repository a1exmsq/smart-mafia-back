import styles from './Features.module.css';

const features = [
  {
    icon: '🎙',
    tag: 'AI Host',
    title: 'Voice-Guided Gameplay',
    description:
      'The AI narrator announces each phase, reads clues, and creates dramatic tension — no human moderator needed.',
  },
  {
    icon: '⚡',
    tag: 'Real-time',
    title: 'Live Room Sync',
    description:
      'All players see the same game state instantly. Built on Socket.io for zero-latency role reveals and voting.',
  },
  {
    icon: '🧠',
    tag: 'Intelligence',
    title: 'Smart Pattern Analysis',
    description:
      'The AI tracks voting patterns, detects behavioral anomalies, and dynamically adjusts narrative hints.',
  },
  {
    icon: '🔐',
    tag: 'Private',
    title: 'Secure Private Rooms',
    description:
      'Each session generates a unique code. Roles are distributed server-side — no client can peek.',
  },
  {
    icon: '📱',
    tag: 'Accessible',
    title: 'No App Needed',
    description:
      'Works on any browser, any device. Share the link, join the room, play in seconds.',
  },
  {
    icon: '🎭',
    tag: 'Roles',
    title: 'Rich Role System',
    description:
      'Mafia, Godfather, Detective, Doctor, Citizen — with more roles planned. Each with unique AI interactions.',
  },
];

export default function Features() {
  return (
    <section className={styles.section} id="features">
      <div className={styles.bg} />
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>The Weapons</span>
          <h2 className={styles.title}>Features</h2>
          <p className={styles.subtitle}>
            Everything you need to run a perfect game of Mafia — powered by AI.
          </p>
        </div>

        <div className={styles.grid}>
          {features.map((f, i) => (
            <div className={styles.card} key={i}>
              <div className={styles.cardTop}>
                <span className={styles.icon}>{f.icon}</span>
                <span className={styles.tag}>{f.tag}</span>
              </div>
              <h3 className={styles.cardTitle}>{f.title}</h3>
              <p className={styles.cardDesc}>{f.description}</p>
              <div className={styles.cardLine} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
