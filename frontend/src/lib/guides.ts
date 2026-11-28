/**
 * The static guide pages (real pages in public/, not app screens, so Google can read them).
 * Linking to them from inside the app gives search engines and people a path to them.
 * Keep in sync with scripts/gen_seo_pages.py.
 */
export interface Guide {
  title: string;
  description: string;
  href: string;
}

export const GUIDES_INDEX = '/guides/';

export const HOW_TO_CHECK_GUIDE: Guide = {
  title: 'How to check a NAFDAC number',
  description: 'Find it on the pack and look it up.',
  href: '/how-to-check-nafdac-number/',
};

export const GUIDES: Guide[] = [
  HOW_TO_CHECK_GUIDE,
  {
    title: 'What to check on a pack before you buy',
    description: 'A quick checklist for any product.',
    href: '/check-a-product-before-you-buy/',
  },
  {
    title: 'How to check if a product is fake in Nigeria',
    description: 'Seven checks before you buy.',
    href: '/guides/how-to-check-if-a-product-is-fake-in-nigeria/',
  },
  {
    title: 'All guides and questions',
    description: 'More short, plain guides.',
    href: GUIDES_INDEX,
  },
];
