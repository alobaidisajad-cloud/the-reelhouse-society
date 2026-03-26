import { Helmet } from 'react-helmet-async'

interface SEOProps {
  title?: string
  description?: string
  image?: string
  url?: string
}

export default function SEO({ title, description, image, url }: SEOProps) {
  const siteName = 'The ReelHouse Society'
  const defaultDesc = 'Dispatches from the society\'s finest critics. Log, review, and discover the cinematic arts.'
  
  const formattedTitle = title ? `${title} — ${siteName}` : siteName
  const finalDesc = description || defaultDesc

  return (
    <Helmet prioritizeSeoTags>
      <title>{formattedTitle}</title>
      <meta name="description" content={finalDesc} />
      
      {/* ── Open Graph / Facebook ── */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={formattedTitle} />
      <meta property="og:description" content={finalDesc} />
      {image && <meta property="og:image" content={image} />}
      {url && <meta property="og:url" content={url} />}
      
      {/* ── Twitter ── */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={formattedTitle} />
      <meta name="twitter:description" content={finalDesc} />
      {image && <meta name="twitter:image" content={image} />}
    </Helmet>
  )
}
