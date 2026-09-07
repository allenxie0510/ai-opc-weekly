import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceTier, sourceCoverageGrade } from '../../lib/evidence-policy.mjs';

test('source grade uses the URL host, not a model-supplied publisher name', () => {
  assert.equal(sourceTier('https://revenuecat.com/blog/post'), 'A');
  assert.equal(sourceTier('https://revenuecat.com.attacker.invalid/post'), 'D');
  assert.equal(sourceTier('https://news.ycombinator.com/item?id=42'), 'C');
  assert.equal(sourceTier('invalid'), 'D');
});
test('one strong publisher does not upgrade weaker supporting sources', () => {
  assert.equal(sourceCoverageGrade([{ source_url: 'https://revenuecat.com/blog/post' }, { source_url: 'https://indiehackers.com/post/one' }, { source_url: 'https://producthunt.com/posts/two' }]), 'C');
});
test('multiple URLs from one publisher do not count as independent corroboration', () => {
  assert.equal(sourceCoverageGrade([{ source_url: 'https://revenuecat.com/one' }, { source_url: 'https://www.revenuecat.com/two' }]), 'C');
  assert.equal(sourceCoverageGrade([{ source_url: 'https://openai.com/one' }, { source_url: 'https://platform.openai.com/two' }]), 'C');
});
test('background and counter evidence cannot raise source coverage', () => {
  assert.equal(sourceCoverageGrade([{ source_url: 'https://revenuecat.com/one', role: 'background' }, { source_url: 'https://github.com/a/b', role: 'counter' }]), 'D');
  assert.equal(sourceCoverageGrade([]), 'D');
});
