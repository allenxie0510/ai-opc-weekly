import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProductTerms,
  isSuspiciousSourceUrl,
  validateSourceUrl,
} from '../lib/source-validation.mjs';

function response(body, { status = 200, url = 'https://publisher.invalid/post/jobric' } = {}) {
  return {
    status,
    url,
    async text() { return body; },
  };
}

test('extracts product terms without generic AI labels', () => {
  assert.deepEqual(extractProductTerms('AI 职位匹配平台 Jobric'), ['Jobric']);
});

test('rejects placeholder-style source URLs', () => {
  assert.equal(isSuspiciousSourceUrl('https://example.com/post/product-123456789'), true);
});

test('fails closed on DNS or network errors', async () => {
  const result = await validateSourceUrl('https://missing.invalid/product', {
    fetchImpl: async () => { throw new Error('ENOTFOUND'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'network-error');
});

test('rejects a missing detail page redirected to the homepage', async () => {
  const result = await validateSourceUrl('https://publisher.invalid/post/jobric', {
    fetchImpl: async () => response('<html><body>' + 'homepage '.repeat(50) + '</body></html>', {
      url: 'https://publisher.invalid/',
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'detail-redirected-to-home');
});

test('requires product identity and exact evidence quote in page content', async () => {
  const quote = "We're already at $3,300 MRR";
  const result = await validateSourceUrl('https://publisher.invalid/post/jobric', {
    expectedTerms: ['Jobric'],
    quote,
    fetchImpl: async () => response(`<html><body><h1>Jobric founder story</h1><p>${quote}</p>${'detail '.repeat(50)}</body></html>`),
  });
  assert.equal(result.ok, true);
});

test('rejects a model-supplied quote that is absent from the source', async () => {
  const result = await validateSourceUrl('https://publisher.invalid/post/jobric', {
    expectedTerms: ['Jobric'],
    quote: 'invented revenue sentence',
    fetchImpl: async () => response('<html><body><h1>Jobric</h1>' + 'real article '.repeat(50) + '</body></html>'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'claim-quote-not-found');
});
