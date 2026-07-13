'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('./presence.cjs');

const NOW = 1_000_000_000_000;
const ago = (sec) => NOW - sec * 1000;

test('computeState: しきい値で online/away/offline を分ける', () => {
  assert.equal(P.computeState(ago(0),    NOW), 'online');
  assert.equal(P.computeState(ago(179),  NOW), 'online');
  assert.equal(P.computeState(ago(180),  NOW), 'online');   // 境界は online 側
  assert.equal(P.computeState(ago(181),  NOW), 'away');
  assert.equal(P.computeState(ago(3600), NOW), 'away');      // 境界は away 側
  assert.equal(P.computeState(ago(3601), NOW), 'offline');
});
test('computeState: 未ログイン(null/0)は offline', () => {
  assert.equal(P.computeState(null, NOW), 'offline');
  assert.equal(P.computeState(0, NOW), 'offline');
  assert.equal(P.computeState(NaN, NOW), 'offline');
});
test('computeState: 時計ずれ(未来)は online 扱い', () => {
  assert.equal(P.computeState(NOW + 5000, NOW), 'online');
});
test('computeState: カスタムしきい値', () => {
  assert.equal(P.computeState(ago(30), NOW, { onlineSec: 20 }), 'away');
  assert.equal(P.computeState(ago(30), NOW, { onlineSec: 20, awaySec: 25 }), 'offline');
});

const members = [
  { userId: 'u_shocho', displayId: 'OP-TOKYO-01',    role: 'pco_admin',    office: '',            organization: 'tokyo' },
  { userId: 'u_k1',     displayId: 'OP-TOKYO-KH-01', role: 'office_editor', office: 'tokyo-koho-01', organization: 'tokyo' },
  { userId: 'u_k2',     displayId: 'OP-TOKYO-KH-02', role: 'office_editor', office: 'tokyo-koho-02', organization: 'tokyo' },
];

test('buildRoster: 状態集計と並び順（在席→離席→オフライン）', () => {
  const lastSeen = { u_shocho: ago(4000), u_k1: ago(10), u_k2: ago(600) };
  const { members: rows, counts } = P.buildRoster(members, lastSeen, { nowMs: NOW, viewerUserId: 'u_k1' });
  assert.deepEqual(counts, { online: 1, away: 1, offline: 1, total: 3 });
  assert.deepEqual(rows.map(r => r.displayId), ['OP-TOKYO-KH-01', 'OP-TOKYO-KH-02', 'OP-TOKYO-01']);
  assert.equal(rows[0].state, 'online');
  assert.equal(rows[0].self, true);      // 自分
  assert.equal(rows[1].state, 'away');
  assert.equal(rows[2].state, 'offline');
});
test('buildRoster: 最終アクセスが無いメンバーは offline・agoSec=null', () => {
  const { members: rows, counts } = P.buildRoster(members, {}, { nowMs: NOW });
  assert.equal(counts.offline, 3);
  assert.equal(rows.every(r => r.agoSec === null && r.state === 'offline'), true);
});
test('buildRoster: pass 等の機微フィールドを含めない', () => {
  const withSecret = members.map(m => ({ ...m, pass: 'scrypt$secret', user: 'login-name' }));
  const { members: rows } = P.buildRoster(withSecret, { u_k1: ago(5) }, { nowMs: NOW });
  assert.equal(rows.some(r => 'pass' in r || 'user' in r || 'userId' in r), false);
});
