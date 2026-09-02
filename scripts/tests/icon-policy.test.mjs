import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const uiRoots = ['app', 'components', 'modules'];
const sourceExtensions = new Set(['.tsx', '.jsx']);
const emojiOrDingbat = /[\u2600-\u27BF]|[\u{1F300}-\u{1FAFF}]/gu;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : sourceExtensions.has(extname(path)) ? [path] : [];
  });
}

test('界面源码不使用 Emoji 或 Dingbat 字符充当图标', () => {
  const violations = uiRoots.flatMap((folder) => sourceFiles(resolve(root, folder))).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(emojiOrDingbat)].map((match) => ({
      file: file.slice(root.length + 1),
      glyph: match[0],
      line: source.slice(0, match.index).split('\n').length,
    }));
  });
  assert.deepEqual(violations, []);
});

test('共享图标为继承文字颜色的线描 SVG', () => {
  const source = readFileSync(resolve(root, 'components/icons.tsx'), 'utf8');
  assert.match(source, /fill: 'none'/);
  assert.match(source, /stroke: 'currentColor'/);
  assert.match(source, /aria-hidden="true"/);
});
