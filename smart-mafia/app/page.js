import Hero from '@/components/Hero/Hero';
import HowItWorks from '@/components/HowItWorks/HowItWorks';
import Features from '@/components/Features/Features';
import Team from '@/components/Team/Team';
import Footer from '@/components/Footer/Footer';
import Navbar from '@/components/Navbar/Navbar';

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <Team />
      <Footer />
    </main>
  );
}
