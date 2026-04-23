import { Helmet } from "react-helmet-async";

const DEFAULT_OG_IMAGE = "https://hazpost.app/opengraph.jpg";

interface SeoMetaProps {
  title: string;
  description: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  jsonLd?: object;
}

export function SeoMeta({
  title,
  description,
  canonical,
  ogTitle,
  ogDescription,
  ogUrl,
  ogImage,
  jsonLd,
}: SeoMetaProps) {
  const image = ogImage ?? DEFAULT_OG_IMAGE;
  const resolvedTitle = ogTitle ?? title;
  const resolvedDesc = ogDescription ?? description;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {canonical && <link rel="canonical" href={canonical} />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="HazPost" />
      <meta property="og:locale" content="es_CO" />
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:description" content={resolvedDesc} />
      {ogUrl && <meta property="og:url" content={ogUrl} />}
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@hazpostapp" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:description" content={resolvedDesc} />
      <meta name="twitter:image" content={image} />

      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
