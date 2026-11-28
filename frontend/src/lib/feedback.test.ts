import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CheckAmApiError } from '../api/client';
import { feedbackErrorMessage } from './feedback';
import { GUIDES } from './guides';

describe('feedbackErrorMessage', () => {
  it('gives a plain sentence for each known failure', () => {
    expect(feedbackErrorMessage(new CheckAmApiError('x', 'FEEDBACK_RATE_LIMITED', 429))).toMatch(/try again later/i);
    expect(feedbackErrorMessage(new CheckAmApiError('x', 'FEEDBACK_REJECTED', 400))).toMatch(/links/i);
    expect(feedbackErrorMessage(new CheckAmApiError('x', 'NETWORK_ERROR', 0))).toMatch(/connection/i);
  });

  it('never shows raw error text', () => {
    expect(feedbackErrorMessage(new Error('socket hang up 10.0.0.1'))).toBe('Could not send right now. Please try again.');
  });
});

describe('guide links', () => {
  it('every guide the app links to exists as a static page', () => {
    for (const g of GUIDES) {
      const file = join(process.cwd(), 'public', g.href, 'index.html');
      expect(existsSync(file), g.href).toBe(true);
    }
  });
});
