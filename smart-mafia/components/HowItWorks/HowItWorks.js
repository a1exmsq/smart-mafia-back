import styles from './HowItWorks.module.css';

const steps = [
  {
    number: '01',
    suit: '♠',
    title: 'Create a Room',
    description:
      'One player opens a private game room and shares the code. No account needed — just a name and a secret.',
  },
  {
    number: '02',
    suit: '♦',
    title: 'Choose Your Role',
    description:
      'The AI host deals roles at random — Mafia, Citizen, Detective, Doctor. Each player receives their fate in silence.',
  },
  {
    number: '03',
    suit: '♣',
    title: 'Let the AI Host Lead',
    description:
      'The voice companion guides every phase: night, accusation, vote. It tracks lies, patterns, and suspicion in real time.',
  },
];

export default function HowItWorks() {
  return (
    <section className={styles.section} id="how-it-works">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>The Rules of Night</span>
          <h2 className={styles.title}>How It Works</h2>
        </div>

        <div className={styles.steps}>
          {steps.map((step, i) => (
            <div className={styles.step} key={i}>
              <div className={styles.stepLeft}>
                <span className={styles.number}>{step.number}</span>
                <div className={styles.connector} />
              </div>
              <div className={styles.stepCard}>
                <span className={styles.suit}>{step.suit}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDesc}>{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
