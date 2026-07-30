import Head from 'next/head'
import { useRouter } from 'next/router'
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, ORGANIZATION_SCHEMA, SITE_NAME, SITE_URL } from '../lib/site'

interface SEOProps {
  title?: string
  description?: string
  canonical?: string
  ogTitle?: string
  ogDesc?: string
  keywords?: string
  noindex?: boolean
  image?: string
  type?: 'website' | 'article'
  publishedTime?: string
  author?: string
}

export default function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  canonical,
  ogTitle,
  ogDesc,
  keywords,
  noindex = false,
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  publishedTime,
  author,
}: SEOProps) {
  const router = useRouter()
  const fullTitle = title
    ? (title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`)
    : `${SITE_NAME} — Digitálna agentúra`
  const path = router.asPath ? router.asPath.split('?')[0] : '/'
  const resolvedCanonical = canonical || `${SITE_URL}${path === '/' ? '/' : path}`
  const robots = noindex ? 'noindex, nofollow' : 'index, follow'
  // Rozmery/typ hlásime LEN pri našom generovanom náhľade (vždy 1200×630 PNG).
  // Pri cudzom obrázku by to bola lož a FB podľa nej poskladá kartu nakrivo.
  const isGeneratedOg = image.includes('/api/og/')
  const pageSchema =
    type === 'article'
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: ogTitle || fullTitle,
          description,
          image,
          mainEntityOfPage: resolvedCanonical,
          ...(publishedTime ? { datePublished: publishedTime } : {}),
          ...(author ? { author: { '@type': 'Person', name: author } } : {}),
          publisher: {
            '@type': 'Organization',
            name: SITE_NAME,
            logo: {
              '@type': 'ImageObject',
              url: `${SITE_URL}/icon.svg`,
            },
          },
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: ogTitle || fullTitle,
          description,
          url: resolvedCanonical,
        }

  return (
    <Head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />

      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <meta name="theme-color" content="#0a0a0a" />
      {keywords && <meta name="keywords" content={keywords} />}

      {/* Canonical */}
      <link rel="canonical" href={resolvedCanonical} />

      {/* OG */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={ogTitle || fullTitle} />
      <meta property="og:description" content={ogDesc || description} />
      <meta property="og:url" content={resolvedCanonical} />
      <meta property="og:locale" content="sk_SK" />
      <meta property="og:image" content={image} />
      {isGeneratedOg && <meta property="og:image:width" content="1200" />}
      {isGeneratedOg && <meta property="og:image:height" content="630" />}
      {isGeneratedOg && <meta property="og:image:type" content="image/png" />}
      <meta property="og:image:alt" content={ogTitle || fullTitle} />
      {type === 'article' && publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {type === 'article' && author && <meta property="article:author" content={author} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle || fullTitle} />
      <meta name="twitter:description" content={ogDesc || description} />
      <meta name="twitter:image" content={image} />

      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_SCHEMA) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
    </Head>
  )
}
