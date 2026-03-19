/**
 * PageSEO — Reusable per-page meta tags using react-helmet-async.
 * Sets title, meta description, and Open Graph tags for every route.
 * Zero runtime cost — just declarative <head> management.
 */
import { Helmet } from 'react-helmet-async'

const SITE_NAME = 'The ReelHouse Society'
const DEFAULT_DESCRIPTION = 'A members-only cinema society for logging, rating, and debating film. Track your obsessions. Curate your archive.'
const DEFAULT_OG_IMAGE = '/og-card.png'
const SITE_URL = 'https://the-reelhouse-society.vercel.app'

interface PageSEOProps {
  title?: string
  description?: string
  ogImage?: string
  ogType?: string
  path?: string
  noIndex?: boolean
}

export default function PageSEO({
  title,
  description = DEFAULT_DESCRIPTION,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  path = '',
  noIndex = false,
}: PageSEOProps) {
  const fullTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME
  const canonicalUrl = `${SITE_URL}${path}`

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage}`} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage}`} />

      {/* Canonical */}
      <link rel="canonical" href={canonicalUrl} />
    </Helmet>
  )
}
