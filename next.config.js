/** @type {import('next').NextConfig} */

// Bezpečnostné hlavičky pre celý web.
// Pozn.: web beží na Verceli (Next.js), NIE na Apache — .htaccess by tu nemal žiadny účinok.
const securityHeaders = [
  // Clickjacking: web sa nesmie vložiť do <iframe> na cudzej doméne
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prehliadač nesmie hádať typ súboru (MIME sniffing)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Do cudzích webov posielame len doménu, nie celú adresu stránky
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Web si nepýta kameru, mikrofón ani polohu
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  // Moderná náhrada X-Frame-Options + zákaz pluginov a prepis http odkazov na https.
  // Skripty zámerne NEobmedzujeme — merací kód sa pridáva v admine (Integrácie)
  // a prísny script-src by ho ticho zablokoval.
  {
    key: 'Content-Security-Policy',
    value: [
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
]

const nextConfig = {
  trailingSlash: true,
  // Neprezrádzať použitú technológiu (x-powered-by: Next.js)
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

module.exports = nextConfig
