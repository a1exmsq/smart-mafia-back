import styles from './Team.module.css';

const members = [
  {
    name: 'Tymofii Snisarenko',
    role: 'Scrum Master · QA · DevOps',
    suit: '♠',
    color: 'cream',
    detail: 'Keeps the ship sailing. CI/CD, Docker, AWS deployments and quality gates.',
  },
  {
    name: 'Andrii Butenko',
    role: 'Frontend · UI/UX',
    suit: '♦',
    color: 'red',
    detail: 'Crafts the visual experience. Figma wireframes, React components, design systems.',
  },
  {
    name: 'Artem Kulinich',
    role: 'Backend · Game Logic',
    suit: '♣',
    color: 'cream',
    detail: 'Architect of the game engine. Room management, role distribution, database design.',
  },
  {
    name: 'Aliaksandr Dailid',
    role: 'Fullstack · AI & API',
    suit: '♥',
    color: 'red',
    detail: 'Bridges intelligence and interface. OpenAI integration, Swagger docs, API design.',
  },
];

export default function Team() {
  return (
    <section className={styles.section} id="team">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>The Syndicate</span>
          <h2 className={styles.title}>The Team</h2>
        </div>

        <div className={styles.grid}>
          {members.map((m, i) => (
            <div className={styles.card} key={i} data-color={m.color}>
              <div className={styles.cardHeader}>
                <span className={`${styles.suit} ${m.color === 'red' ? styles.suitRed : ''}`}>
                  {m.suit}
                </span>
                <div className={styles.meta}>
                  <h3 className={styles.name}>{m.name}</h3>
                  <span className={styles.role}>{m.role}</span>
                </div>
              </div>
              <p className={styles.detail}>{m.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
