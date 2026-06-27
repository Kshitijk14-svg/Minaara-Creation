import type { Metadata } from 'next';
import Script from 'next/script';
import { CurrencyProvider } from '@/components/providers/CurrencyProvider';
import { CartProvider } from '@/components/providers/CartProvider';
import { PageTransition } from '@/components/ui/PageTransition';
import { SmoothScrollProvider } from '@/components/providers/SmoothScrollProvider';
import { Navbar } from '@/components/ui/Navbar';
import { auth } from '@/lib/auth';
import './globals.css';

async function getActiveTheme(): Promise<string> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.UPSTASH_REDIS_REST_URL?.includes('your-upstash-url') ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return 'pastel-pink';
  }

  const CACHE_KEY = 'design_config';
  let theme = 'pastel-pink'; // default fallback

  // Redis is the primary source (TTL 1h, invalidated on admin save)
  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<{ activeTheme: string }>(CACHE_KEY);
    if (cached?.activeTheme) {
      return cached.activeTheme;
    }
  } catch (e) {
    console.error('Redis error in layout:', e);
  }

  // Fallback to Prisma with a timeout so build doesn't block/fail
  const withTimeout = <T,>(promise: Promise<T>, ms = 1500) => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms)),
    ]);
  };

  try {
    const { db } = await import('@/db/index');
    const { designConfigs } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const [config] = await withTimeout(
      db.select({ activeTheme: designConfigs.activeTheme })
        .from(designConfigs)
        .where(eq(designConfigs.id, 'current_config'))
        .limit(1),
    );
    if (config?.activeTheme) {
      theme = config.activeTheme;
    }
  } catch (e) {
    console.warn('DB error in layout (falling back to default):', (e as Error).message);
  }

  return theme;
}

export const metadata: Metadata = {
  title: {
    template: '%s | Minaara Creation',
    default: 'Minaara Creation — Premium Indian Womenswear',
  },
  description:
    'Discover our curated collection of premium kurtas, anarkalis, and ethnic womenswear. Elevated Indian fashion for the modern woman.',
  keywords: ['kurta', 'Indian womenswear', 'ethnic wear', 'anarkali', 'festive wear', 'Minaara Creation'],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'Minaara Creation',
  },
};

const GA4_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

import { Cormorant_Garamond, DM_Sans, JetBrains_Mono } from 'next/font/google';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-body',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const activeTheme = await getActiveTheme();
  const themeClass = `theme-${activeTheme}`;
  
  return (
    <html lang="en" className={`${cormorant.variable} ${dmSans.variable} ${jetBrainsMono.variable} ${themeClass}`}>

      <head>
        {/* JSON-LD Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ClothingStore",
              "name": "Minaara Creation",
              "image": "https://minaaracreation.com/hero-woman.webp",
              "description": "Premium Indian womenswear, handcrafted kurtas, and luxury ethnic fashion.",
              "url": "https://minaaracreation.com",
              "telephone": "+910000000000",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "Bapu Bazaar",
                "addressLocality": "Jaipur",
                "postalCode": "302003",
                "addressCountry": "IN"
              },
              "priceRange": "$$$"
            })
          }}
        />
      </head>
      <body>
        {/* GA4 Analytics */}
        {GA4_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA4_ID}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        )}

        {/* Meta Pixel */}
        {META_PIXEL_ID && (
          <Script id="meta-pixel-init" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.focused=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
        )}

        <CurrencyProvider>
          <CartProvider>
            {/* Silk Curtain — fires on every route change */}
            <PageTransition />
            <Navbar session={session} />
            <SmoothScrollProvider>
              {children}
            </SmoothScrollProvider>
          </CartProvider>
        </CurrencyProvider>
      </body>
    </html>
  );
}
