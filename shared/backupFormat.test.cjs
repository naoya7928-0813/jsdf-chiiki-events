'use strict';
// バックアップ形式（shared/backupFormat.cjs・backupAssemble.cjs）と再認証判定（shared/stepUp.cjs）のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./backupFormat.cjs');
const { assembleBackup, backupFileName } = require('./backupAssemble.cjs');
const { stepUpDecision, STEP_UP_TTL_SEC } = require('./stepUp.cjs');

const src = () => ({
  manualEvents: [{ id: 'manual-tokyo-20261010-abc', pref: 'tokyo', office: 'shibuya', title: '試験', status: 'draft', createdBy: 'OP-1' }],
  overrides: { 't-1': { time: '10:00', _pref: 'tokyo', _office: '', _by: 'OP-1', _at: '2026-09-23' } },
  accounts: [{ userId: 'u1', user: 'nat', pass: 'scrypt$16384$aa$bb', organization: '*', role: 'national_admin', displayId: 'OP-N', enabled: true, sessionVersion: 3, mfa: { secret: 'x' } }],
  createdAt: '2026-09-23T12:00:00.000Z', createdBy: 'OP-N', appVersion: '1.36.22', gitCommit: 'abc', sourceEnvironment: 'production',
});
const audit = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ at: `2026-09-${String(1 + ((from + i) % 28)).padStart(2, '0')}`, action: 'event.update', targetId: `e${from + i}` }));
const full = () => {
  const core = B.buildCoreBackup(src());
  return assembleBackup(core, [B.buildAuditPage(audit(3, 3), 1, 6), B.buildAuditPage(audit(3, 0), 0, 6)]);
};

test('canonicalJson / sha256: キーの順番に依存しない', () => {
  assert.equal(B.sha256({ a: 1, b: [1, { y: 2, x: 1 }] }), B.sha256({ b: [1, { x: 1, y: 2 }], a: 1 }));
  assert.notEqual(B.sha256({ a: 1 }), B.sha256({ a: 2 }));
});

test('アカウントはパスワード・ハッシュ・MFA を含まない（許可リスト方式）', () => {
  const core = B.buildCoreBackup(src());
  assert.deepEqual(Object.keys(core.sections.accounts[0]).sort(),
    ['displayId', 'enabled', 'organization', 'role', 'sessionVersion', 'user', 'userId']);
  assert.deepEqual(B.findSecretKeys(core), []);
  assert.doesNotMatch(JSON.stringify(core), /scrypt\$/, 'ハッシュの値が含まれている');
  assert.doesNotMatch(JSON.stringify(core.sections), /"(?:pass|passHash|mfa)":/, '秘密のキーが含まれている');
  assert.deepEqual(core.manifest.sections.accounts.redacted, ['pass', 'passHash', 'mfa'], '除外した項目名は manifest に記録する');
});

test('秘密項目が紛れ込んだら作成を止める（手動イベント・上書きに混入した場合も）', () => {
  const s = src(); s.manualEvents[0].token = 'x';
  assert.throws(() => B.buildCoreBackup(s), /秘密項目/);
  const t = src(); t.overrides['t-1'].contact = 'a@example.jp';
  assert.throws(() => B.buildCoreBackup(t), /秘密項目/);
});

test('manifest: schemaVersion・作成日時・作成者・件数・checksum を持つ', () => {
  const { manifest } = full();
  assert.equal(manifest.format, B.FORMAT);
  assert.equal(manifest.schemaVersion, B.SCHEMA_VERSION);
  assert.equal(manifest.createdAt, '2026-09-23T12:00:00.000Z');
  assert.equal(manifest.createdBy, 'OP-N');
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.sections).map(([k, v]) => [k, v.count])),
    { manualEvents: 1, overrides: 1, accounts: 1, audit: 6 });
  assert.equal(manifest.sections.audit.pages.length, 2);
});

test('監査ログはページを古い順（page 0 から）に並べて1ファイルにする', () => {
  const b = full();
  assert.deepEqual(b.sections.audit.map(e => e.targetId), ['e0', 'e1', 'e2', 'e3', 'e4', 'e5']);
});

test('verifyBackup: 正しいファイルは合格。件数・schemaVersion・作成日時を返す', () => {
  const r = B.verifyBackup(JSON.parse(JSON.stringify(full())));
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.counts, { manualEvents: 1, overrides: 1, accounts: 1, audit: 6 });
  assert.equal(r.schemaVersion, B.SCHEMA_VERSION);
});

test('verifyBackup: 改ざん・欠落・件数不一致・新しすぎる版・秘密項目を検出する', () => {
  const edit = (fn) => { const b = JSON.parse(JSON.stringify(full())); fn(b); return B.verifyBackup(b); };
  assert.match(edit(b => { b.sections.manualEvents[0].title = '改ざん'; }).errors.join(), /manualEvents: checksum/);
  assert.match(edit(b => { b.sections.audit[4].action = 'x'; }).errors.join(), /audit: ページ 1 の checksum/);
  assert.match(edit(b => { b.sections.audit.pop(); }).errors.join(), /audit: 件数/);
  assert.match(edit(b => { delete b.sections.overrides; }).errors.join(), /overrides がありません/);
  assert.match(edit(b => { b.manifest.schemaVersion = B.SCHEMA_VERSION + 1; }).errors.join(), /より新しい/);
  assert.match(edit(b => { b.sections.accounts[0].passHash = 'x'; }).errors.join(), /秘密項目/);
  assert.equal(B.verifyBackup(null).ok, false);
});

test('backupFileName: JST の日時でファイル名を作る', () => {
  assert.equal(backupFileName('2026-09-23T15:30:00.000Z'), 'jsdf-backup-20260924-0030.json');
});

test('stepUpDecision: 再認証から一定時間だけ有効（未実施・期限切れ・未来時刻は不可）', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  assert.deepEqual(stepUpDecision({ stepUpAt: undefined, now }), { ok: false, reason: 'step_up_required' });
  assert.equal(stepUpDecision({ stepUpAt: now - 60_000, now }).ok, true);
  assert.equal(stepUpDecision({ stepUpAt: now - (STEP_UP_TTL_SEC + 1) * 1000, now }).reason, 'step_up_expired');
  assert.equal(stepUpDecision({ stepUpAt: now + 10 * 60_000, now }).ok, false);
  assert.equal(stepUpDecision({ stepUpAt: now - 1000, now, ttlSec: 0 }).reason, 'step_up_expired');
});
