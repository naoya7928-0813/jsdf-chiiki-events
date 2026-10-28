'use strict';
// 依存パッケージの脆弱性監査の判定（shared/depAudit.cjs）と受け入れ一覧（security/audit-allowlist.json）の検査。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const A = require('./depAudit.cjs');

// npm audit --json の形（必要な部分だけ）
const AUDIT = {
  vulnerabilities: {
    satori: {
      severity: 'moderate', nodes: ['node_modules/satori'],
      via: [{ source: 1, name: 'satori', title: 'Satori-generated SVG has improper escaping', url: 'https://github.com/advisories/GHSA-wx4j-mvgx-mqwp', severity: 'moderate', range: '<0.33.5' }],
    },
    // 巻き込まれただけ（via が文字列）は数えない
    '@vercel/og': { severity: 'moderate', nodes: ['node_modules/@vercel/og'], via: ['satori'] },
    'brace-expansion': {
      severity: 'high', nodes: ['node_modules/brace-expansion'],
      via: [
        { source: 2, name: 'brace-expansion', title: 'DoS A', url: 'https://github.com/advisories/GHSA-3jxr-9vmj-r5cp', severity: 'high', range: '<5.0.12' },
        { source: 2, name: 'brace-expansion', title: 'DoS A', url: 'https://github.com/advisories/GHSA-3jxr-9vmj-r5cp', severity: 'high', range: '<5.0.12' },
      ],
    },
  },
};

const entry = (over = {}) => ({
  id: 'GHSA-wx4j-mvgx-mqwp', package: 'satori', projects: ['root'],
  reason: 'r', mitigation: 'm', expires: '2027-01-31', reviewedAt: '2026-10-28', ...over,
});

test('collectFindings: advisory 本体だけを重複なしで取り出し、重大度の高い順に並べる', () => {
  const f = A.collectFindings(AUDIT, 'root');
  assert.deepStrictEqual(f.map(x => [x.package, x.id, x.severity]), [
    ['brace-expansion', 'GHSA-3jxr-9vmj-r5cp', 'high'],
    ['satori', 'GHSA-wx4j-mvgx-mqwp', 'moderate'],
  ]);
  assert.strictEqual(f[0].project, 'root');
});

test('collectFindings: 空・壊れた入力でも落ちない', () => {
  assert.deepStrictEqual(A.collectFindings({}, 'root'), []);
  assert.deepStrictEqual(A.collectFindings(null, 'root'), []);
});

test('evaluate: 一覧に無い指摘は失敗', () => {
  const r = A.evaluate(A.collectFindings(AUDIT, 'root'), { entries: [entry()] }, '2026-10-28');
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.blocking.map(x => x.package), ['brace-expansion']);
  assert.deepStrictEqual(r.accepted.map(x => x.package), ['satori']);
});

test('evaluate: すべて一覧にあり期限内なら合格', () => {
  const findings = A.collectFindings(AUDIT, 'root').filter(x => x.package === 'satori');
  const r = A.evaluate(findings, { entries: [entry()] }, '2027-01-31'); // 期限当日はまだ有効
  assert.strictEqual(r.ok, true);
});

test('evaluate: 期限切れは失敗', () => {
  const findings = A.collectFindings(AUDIT, 'root').filter(x => x.package === 'satori');
  const r = A.evaluate(findings, { entries: [entry()] }, '2027-02-01');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.expired.length, 1);
});

test('evaluate: プロジェクトが違えば当たらない（scraper の受け入れは root に効かない）', () => {
  const findings = A.collectFindings(AUDIT, 'root').filter(x => x.package === 'satori');
  const r = A.evaluate(findings, { entries: [entry({ projects: ['scraper'] })] }, '2026-10-28');
  assert.strictEqual(r.blocking.length, 1);
});

test('evaluate: 今は出ない項目は unused（警告のみで合格）', () => {
  const r = A.evaluate([], { entries: [entry()] }, '2026-10-28');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.unused.length, 1);
});

test('evaluate: 理由・対策・期限の書き漏れは失敗', () => {
  const r = A.evaluate([], { entries: [entry({ reason: '' }), entry({ expires: '2027/01/31' })] }, '2026-10-28');
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('reason')));
  assert.ok(r.errors.some(e => e.includes('YYYY-MM-DD')));
});

test('formatMarkdown: 表の区切り文字を壊さない', () => {
  const findings = [{ project: 'root', package: 'a|b', id: 'GHSA-aaaa-bbbb-cccc', severity: 'low', title: 'x|y', url: '', range: '' }];
  const md = A.formatMarkdown(A.evaluate(findings, { entries: [] }, '2026-10-28'));
  assert.ok(md.includes('a\\|b'));
  assert.ok(md.includes('未対応'));
});

test('security/audit-allowlist.json: 書き方が正しく、見直し期限は確認日から6か月以内', () => {
  const file = path.join(__dirname, '..', 'security', 'audit-allowlist.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(A.validateAllowlist(list), []);
  for (const e of list.entries) {
    const days = (Date.parse(e.expires) - Date.parse(e.reviewedAt)) / 86400e3;
    assert.ok(days > 0 && days <= 183, `${e.id}/${e.package}: 期限が長すぎます（${days}日）。受け入れたまま放置しないため最長6か月`);
    for (const p of e.projects || []) assert.ok(['root', 'scraper'].includes(p), `${e.id}: 不明な projects ${p}`);
  }
});
