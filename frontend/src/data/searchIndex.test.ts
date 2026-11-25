import { describe, expect, it } from 'vitest';
import MiniSearch from 'minisearch';
import { significantWords } from './searchIndex';

describe('significantWords', () => {
  it('lower-cases and splits on spaces and punctuation', () => {
    expect(significantWords('Gino Party-Jollof')).toEqual(['gino', 'party', 'jollof']);
  });

  it('drops filler words but never returns an empty list', () => {
    expect(significantWords('Salt and the Pepper')).toEqual(['salt', 'pepper']);
    expect(significantWords('the of')).toEqual(['the', 'of']);
  });
});

describe('multi-word search rule', () => {
  const docs = [
    { id: '1', product_name: 'MINIMIE INSTANT NOODLES PARTY JOLLOF FLAVOR', brand_name: '', manufacturer: '' },
    { id: '2', product_name: 'KABISA Party Spirit Drink', brand_name: '', manufacturer: '' },
    { id: '3', product_name: 'SUPRA-GINO GIN FLAVOURED SPIRIT DRINK', brand_name: '', manufacturer: '' },
    { id: '4', product_name: 'TERRA JOLLOF SEASONING CUBE', brand_name: '', manufacturer: '' },
  ];
  const index = new MiniSearch({ fields: ['product_name', 'brand_name', 'manufacturer'] });
  index.addAll(docs);
  const search = (q: string) =>
    index.search(significantWords(q).join(' '), {
      combineWith: 'AND',
      prefix: (t: string) => t.length >= 3,
      fuzzy: (t: string) => (t.length > 5 ? 0.2 : false),
    });

  it('finds a product when every word matches', () => {
    expect(search('party jollof').map((h) => h.id)).toEqual(['1']);
  });

  it('says nothing when only some words match (not found, not a pile of unrelated products)', () => {
    expect(search('gino party jollof')).toEqual([]);
  });
});
