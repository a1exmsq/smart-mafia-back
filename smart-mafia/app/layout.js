import './globals.css';

export const metadata = {
  title: 'Smart Mafia — AI Voice Companion',
  description: 'Play Mafia with an intelligent AI host. Create rooms, assign roles, and let the AI guide your game.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
