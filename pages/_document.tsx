import { Html, Head, Main, NextScript } from 'next/document'

// Bez tohto súboru Next vykreslí <html> BEZ atribútu lang — Lighthouse to hlási
// v Dostupnosti a čítačky obrazovky potom čítajú slovenský text anglickou výslovnosťou.
export default function Document() {
  return (
    <Html lang="sk">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
