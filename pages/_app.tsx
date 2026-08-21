import type { AppProps } from 'next/app';
import { Inter, Space_Mono } from 'next/font/google';
import '../styles/globals.css';
import Effects from '../components/Effects';
import TrackingScripts from '../components/TrackingScripts';

// Fonty sa sťahujú pri builde a servírujú z vlastnej domény.
// Predtým boli v globals.css cez @import na fonts.googleapis.com — prehliadač
// musel najprv stiahnuť náš CSS, až potom cudzí CSS, až potom samotný font
// (PageSpeed to hlásil ako blokovanie vykreslenia).
// POZOR: latin-ext je povinný, inak vypadne slovenská diakritika (č ď ľ ň ŕ š ť ž).
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap' });
const spaceMono = Space_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '700'], display: 'swap' });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{`
        :root {
          --font-display: ${inter.style.fontFamily};
          --font-body: ${inter.style.fontFamily}, -apple-system, sans-serif;
          --font-mono: ${spaceMono.style.fontFamily}, monospace;
        }
      `}</style>
      <Effects />
      <TrackingScripts />
      <Component {...pageProps} />
    </>
  );
}
