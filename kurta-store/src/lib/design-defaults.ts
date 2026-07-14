/**
 * Fallback content for the admin-editable homepage sections — today's
 * hardcoded copy, kept here so DesignTab's editor (default new-item
 * template) and HomeClient's public fallback (when a design_configs field
 * is null, e.g. before the first admin save) never drift apart.
 */
import type { HeroContent, UspItem, AboutPanel, EditorialStory, StatItem, FooterContent } from '@/types/schema';

export const DEFAULT_HERO_CONTENT: HeroContent = {
  badgeText: 'New Collection — SS 2025',
  headline: 'Dressed in',
  headlineEmphasis: 'Grace',
  subheading: 'Ethnic wear for the woman who carries her heritage with quiet confidence.',
  imageUrl: '/hero-woman.webp',
  ctaPrimaryLabel: 'Explore Collection',
  ctaPrimaryHref: '#collection',
  ctaSecondaryLabel: 'View Lookbook',
  ctaSecondaryHref: '/lookbook',
};

export const DEFAULT_USP_ITEMS: UspItem[] = [
  { icon: '✦', title: '100% Organic Fabrics', sub: 'Ethically sourced cotton & linen' },
  { icon: '✦', title: 'Artisanal Handblock Prints', sub: 'Traditional printing heritage' },
  { icon: '✦', title: 'Hassle-Free Exchange', sub: 'Easy returns within 7 days' },
];

export const DEFAULT_MARQUEE_WORDS: string[] = [
  'Handcrafted', 'Heritage', 'Organic', 'Artisanal', 'Timeless', 'Grace', 'Culture', 'Tradition', 'Weaves', 'Minara',
];

export const DEFAULT_ABOUT_PANELS: AboutPanel[] = [
  { num: '01', label: 'Origin', heading: 'Born in the lanes of Jaipur', body: 'Our journey began with a single kurta crafted by a master block-printer in a 400-year-old haveli. That garment sparked a movement — slow fashion rooted in Indian heritage.', imageUrl: '/lookbook-banner.webp' },
  { num: '02', label: 'Craft', heading: 'Every thread tells a story', body: 'We work exclusively with artisans who have inherited their craft across generations. Block printing, chikankari, zardosi — each technique takes years to master, and we honour that mastery.', imageUrl: '/lookbook-outdoor.webp' },
  { num: '03', label: 'Fabric', heading: 'Nature\'s finest woven in', body: 'We source only organic cotton, linen, and silk from certified farms. No synthetic dyes, no shortcuts — just pure, breathable fabric that feels as good as it looks.', imageUrl: '/lookbook-hotspot.webp' },
  { num: '04', label: 'Promise', heading: 'Fashion that gives back', body: 'For every piece sold, we invest 5% back into the communities of our artisans. Real wages, fair hours, and a sustainable livelihood for the hands behind each garment.', imageUrl: '/hero-woman.webp' },
];

export const DEFAULT_EDITORIAL_STORIES: EditorialStory[] = [
  { chapter: 'Chapter 01', title: 'The Occasion Edit', desc: 'Festive dressing reimagined for the contemporary woman.', imageUrl: '/lookbook-banner.webp', href: '/lookbook' },
  { chapter: 'Chapter 02', title: 'Garden Stories', desc: 'Florals and foliage meet handblock print heritage.', imageUrl: '/lookbook-outdoor.webp', href: '/lookbook' },
  { chapter: 'Chapter 03', title: 'Heritage Craft', desc: 'Ancient weaving traditions for the modern wardrobe.', imageUrl: '/lookbook-outdoor.webp', href: '/lookbook' },
];

export const DEFAULT_STATS: StatItem[] = [
  { value: 2500, suffix: '+', label: 'Happy Customers' },
  { value: 150, suffix: '+', label: 'Unique Designs' },
  { value: 100, suffix: '%', label: 'Organic Fabrics' },
  { value: 7, suffix: 'yrs', label: 'Craft Heritage' },
];

export const DEFAULT_FOOTER_CONTENT: FooterContent = {
  tagline: 'Minara Creation',
  links: [
    { href: '/', label: 'Collection' },
    { href: '/lookbook', label: 'Lookbook' },
    { href: '/cart', label: 'Cart' },
  ],
};
