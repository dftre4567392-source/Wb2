import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');

test('composer stays in normal document flow and cannot cover chat messages', () => {
  assert.match(css, /\.content\{[^}]*min-height:0[^}]*overflow:hidden/);
  assert.match(css, /\.conversation\{[^}]*min-height:0[^}]*overflow-y:auto/);
  assert.match(css, /\.composerWrap\{[^}]*position:relative[^}]*bottom:auto[^}]*transform:none/);
  assert.doesNotMatch(css, /\.composerWrap\{[^}]*position:absolute/);
});

test('mobile layout keeps composer in flow and respects safe area', () => {
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.composerWrap\{[^}]*padding:[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.messages\{width:min\(860px,100%\);padding:36px 24px 28px\}/);
});
