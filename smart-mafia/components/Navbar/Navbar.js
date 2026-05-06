import Link from 'next/link';
import styles from './Navbar.module.css';

export default function Navbar() {
  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>♠</span>
        <span className={styles.logoText}>SMART MAFIA</span>
      </div>
      <ul className={styles.links}>
        <li><a href="#how-it-works">How It Works</a></li>
        <li><a href="#features">Features</a></li>
        <li><a href="#team">Team</a></li>
      </ul>
      <Link href="/join" className={styles.cta}>Enter Room</Link>
    </nav>
  );
}
