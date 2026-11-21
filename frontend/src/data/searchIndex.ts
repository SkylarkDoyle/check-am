import MiniSearch from 'minisearch';
import { db } from '../db';
import { Product, ProductCategory } from '../types';

export interface SearchResultItem extends Product {
  match_type?: 'reg_exact' | 'reg_prefix' | 'name' | 'maker';
}

let searchIndex: MiniSearch<Product> | null = null;
const productCache = new Map<string, Product>();
let initPromise: Promise<void> | null = null;

function createMiniSearchInstance(): MiniSearch<Product> {
  return new MiniSearch<Product>({
    fields: ['product_name', 'brand_name', 'manufacturer'],
    storeFields: ['id', 'category', 'status'],
    searchOptions: {
      prefix: true,
      fuzzy: (term: string) => (term.length > 3 ? 0.2 : false),
      boost: {
        product_name: 2.5,
        brand_name: 2.5,
        manufacturer: 1.0,
      },
    },
  });
}

export async function ensureSearchIndex(): Promise<void> {
  if (searchIndex && productCache.size > 0) {
    return;
  }
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      const products = await db.products.toArray();
      productCache.clear();
      for (const p of products) {
        productCache.set(p.id, p);
      }

      const index = createMiniSearchInstance();
      if (products.length > 0) {
        index.addAll(products);
      }
      searchIndex = index;
    } catch (err) {
      console.warn('Failed to initialize search index:', err);
    }
  })();

  await initPromise;
  initPromise = null;
}

export async function rebuildSearchIndex(): Promise<void> {
  try {
    const products = await db.products.toArray();
    productCache.clear();
    for (const p of products) {
      productCache.set(p.id, p);
    }

    const index = createMiniSearchInstance();
    if (products.length > 0) {
      index.addAll(products);
    }
    searchIndex = index;
  } catch (err) {
    console.warn('Failed to rebuild search index:', err);
  }
}

function determineMatchType(match: Record<string, string[]>): 'name' | 'maker' {
  const allFields = Object.values(match).flat();
  if (allFields.includes('product_name') || allFields.includes('brand_name')) {
    return 'name';
  }
  if (allFields.includes('manufacturer')) {
    return 'maker';
  }
  return 'name';
}

export async function localSearchProducts(
  query: string,
  category?: ProductCategory | null,
  limit = 20
): Promise<SearchResultItem[]> {
  const q = query.trim();
  if (!q) return [];

  await ensureSearchIndex();

  const norm = q.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const isRegCandidate = /\d/.test(norm) && norm.length >= 2;
  const results: SearchResultItem[] = [];
  const seenIds = new Set<string>();

  // 1. If query contains digits, prioritize registration number matches (exact, then prefix)
  if (isRegCandidate) {
    // 1a. Exact registration number match
    let exactMatches = await db.products
      .where('normalized_reg_num')
      .equals(norm)
      .toArray();

    if (category) {
      exactMatches = exactMatches.filter((p) => p.category === category);
    }

    for (const match of exactMatches) {
      if (!seenIds.has(match.id)) {
        seenIds.add(match.id);
        results.push({ ...match, match_type: 'reg_exact' });
      }
    }

    // 1b. Prefix registration number match
    if (results.length < limit) {
      let prefixMatches = await db.products
        .where('normalized_reg_num')
        .startsWith(norm)
        .limit(limit - results.length + 5)
        .toArray();

      if (category) {
        prefixMatches = prefixMatches.filter((p) => p.category === category);
      }

      for (const match of prefixMatches) {
        if (!seenIds.has(match.id)) {
          seenIds.add(match.id);
          results.push({ ...match, match_type: 'reg_prefix' });
          if (results.length >= limit) break;
        }
      }
    }

    // If an exact reg match was found, return immediately
    if (results.some((r) => r.match_type === 'reg_exact')) {
      return results.slice(0, limit);
    }
  }

  // 2. Full-text search on product_name, brand_name, manufacturer with MiniSearch
  if (results.length < limit && searchIndex && searchIndex.documentCount > 0) {
    let textMatches = searchIndex.search(q, {
      combineWith: 'AND',
      prefix: true,
      fuzzy: (term: string) => (term.length > 3 ? 0.2 : false),
      boost: {
        product_name: 2.5,
        brand_name: 2.5,
        manufacturer: 1.0,
      },
      filter: category ? (doc) => (doc as any).category === category : undefined,
    });

    if (textMatches.length === 0 && q.includes(' ')) {
      // Fallback to OR combination if multi-word query had 0 AND results
      textMatches = searchIndex.search(q, {
        combineWith: 'OR',
        prefix: true,
        fuzzy: (term: string) => (term.length > 3 ? 0.2 : false),
        boost: {
          product_name: 2.5,
          brand_name: 2.5,
          manufacturer: 1.0,
        },
        filter: category ? (doc) => (doc as any).category === category : undefined,
      });
    }

    for (const hit of textMatches) {
      if (!seenIds.has(hit.id)) {
        seenIds.add(hit.id);
        let prod = productCache.get(hit.id);
        if (!prod) {
          prod = await db.products.get(hit.id);
          if (prod) productCache.set(prod.id, prod);
        }

        if (prod) {
          const matchType = determineMatchType(hit.match);
          results.push({ ...prod, match_type: matchType });
          if (results.length >= limit) break;
        }
      }
    }
  }

  return results.slice(0, limit);
}
