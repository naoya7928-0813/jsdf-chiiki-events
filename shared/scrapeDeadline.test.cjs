'use strict';
/**
 * scrapeDeadline のテスト
 *
 * 判定そのものに加えて、**実ファイルとのズレ**を検出するものを重視する。
 * cron とスロットの対応表がズレると、待機も打ち切りも効かないまま
 * 「中途半端な時刻に通知が飛ぶ」という以前の状態へ静かに戻ってしまう。
 */
const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const {
  SLOTS, WINDOW_MINUTES, RESERVE_MINUTES, MIN_USEFUL_MINUTES, ROTATION_STEP,
  slotForSchedule, slotTargetEpoch, slotWindowEndEpoch, resolveDeadline,
  rotationOffset, keysNeedingCarryOver,
} = require('./scrapeDeadline.cjs');

const read = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

/** その日の UTC 時刻から epoch(ms) を作る補助 */
const utc = (h, m = 0, day = 15) => Date.UTC(2026, 8, day, h, m, 0, 0);

// ── スロット表 ──────────────────────────────────────────────
test('slotForSchedule: cron からスロットを引ける', () => {
  assert.equal(slotForSchedule('33 20 * * *').labelJst, '08:00');
  assert.equal(slotForSchedule('33 0 * * *').labelJst,  '12:00');
  assert.equal(slotForSchedule('33 6 * * *').labelJst,  '18:00');
});

test('slotForSchedule: 手動実行・未知の cron は null（締切をかけない）', () => {
  assert.equal(slotForSchedule(''), null);
  assert.equal(slotForSchedule(undefined), null);
  assert.equal(slotForSchedule(null), null);
  assert.equal(slotForSchedule('0 0 * * *'), null);
});

test('targetUtc は JST の配信時刻と一致する（UTC+9）', () => {
  for (const slot of SLOTS) {
    const [uh] = slot.targetUtc.split(':').map(Number);
    const [jh] = slot.labelJst.split(':').map(Number);
    assert.equal((uh + 9) % 24, jh, `${slot.cron}: UTC ${slot.targetUtc} は JST ${slot.labelJst} ではありません`);
  }
});

test('slotTargetEpoch: 実行中の UTC 日の目標時刻を返す', () => {
  const slot = slotForSchedule('33 20 * * *');   // 23:00 UTC
  // cron は 20:33 UTC 起動。少し遅れて 21:10 UTC に動いていても同じ日の 23:00 を指す
  assert.equal(slotTargetEpoch(slot, utc(21, 10)), utc(23, 0));
  assert.equal(slotTargetEpoch(slot, utc(20, 35)), utc(23, 0));
});

// ── 締切の決定 ──────────────────────────────────────────────
test('定刻どおり起動: 配信枠の終わりの RESERVE_MINUTES 前が締切になる', () => {
  // 締切は枠の「開始」ではなく「終わり」から逆算する。
  // 08:00〜09:00 の枠なら 09:00 の RESERVE_MINUTES 前まで取得してよい。
  const r = resolveDeadline({ schedule: '33 20 * * *', nowMs: utc(20, 33) });
  assert.equal(r.reason, 'ok');
  assert.equal(r.targetMs, utc(23, 0), '枠の開始');
  assert.equal(r.windowEndMs, utc(23, 0) + WINDOW_MINUTES * 60_000, '枠の終わり');
  assert.equal(r.deadlineMs, r.windowEndMs - RESERVE_MINUTES * 60_000);
  assert.equal(Math.round(r.availableMinutes), 147 + WINDOW_MINUTES - RESERVE_MINUTES);
});

test('少し遅れて起動: 締切は同じで、使える時間だけ減る', () => {
  const r = resolveDeadline({ schedule: '33 0 * * *', nowMs: utc(2, 0) });   // 枠 03:00〜04:00 UTC
  assert.equal(r.reason, 'ok');
  assert.equal(r.deadlineMs, utc(3, 0) + WINDOW_MINUTES * 60_000 - RESERVE_MINUTES * 60_000);
  assert.equal(Math.round(r.availableMinutes), 60 + WINDOW_MINUTES - RESERVE_MINUTES);
});

test('枠の開始を過ぎても、終わりまで余裕があれば締切を使う', () => {
  // 窓にしたことで拾えるようになった回。開始(03:00)は過ぎているが
  // 終わり(04:00)まで50分あるので、打ち切りを効かせたまま枠の中で掲載できる。
  const r = resolveDeadline({ schedule: '33 0 * * *', nowMs: utc(3, 10) });
  assert.equal(r.reason, 'ok');
  assert.equal(r.deadlineMs, utc(4, 0) - RESERVE_MINUTES * 60_000);
  assert.ok(r.availableMinutes > MIN_USEFUL_MINUTES);
});

test('起動が遅すぎる: 締切を使わず最後まで走らせる', () => {
  // 枠の終わり 04:00 UTC の 10 分前に起動 → 実質使えるのは 4 分。ここで打ち切ると
  // 更新できる地本がほぼ無いまま「枠内だが新着ゼロ」を配信することになる。
  const r = resolveDeadline({ schedule: '33 0 * * *', nowMs: utc(3, 50) });
  assert.equal(r.reason, 'too-late');
  assert.equal(r.deadlineMs, null, '締切を無効にしていません');
  assert.equal(r.targetMs, utc(3, 0), '狙っていた枠自体は分かるようにしておく');
  assert.equal(r.windowEndMs, utc(4, 0));
});

test('枠の終わりも過ぎている: 締切を使わず最後まで走らせる', () => {
  const r = resolveDeadline({ schedule: '33 0 * * *', nowMs: utc(5, 30) });  // 枠 03:00〜04:00 を1.5h超過
  assert.equal(r.reason, 'too-late');
  assert.equal(r.deadlineMs, null);
  assert.ok(r.availableMinutes < 0);
});

test('境界: ちょうど MIN_USEFUL_MINUTES 残っていれば締切を使う', () => {
  const target = utc(3, 0) + WINDOW_MINUTES * 60_000;   // 枠の終わりから逆算する
  const nowMs  = target - (RESERVE_MINUTES + MIN_USEFUL_MINUTES) * 60_000;
  const on  = resolveDeadline({ schedule: '33 0 * * *', nowMs });
  const off = resolveDeadline({ schedule: '33 0 * * *', nowMs: nowMs + 60_000 });
  assert.equal(on.reason, 'ok');
  assert.equal(off.reason, 'too-late');
});

test('手動実行（スロットなし）は締切をかけない', () => {
  const r = resolveDeadline({ schedule: '', nowMs: utc(1, 0) });
  assert.equal(r.reason, 'no-slot');
  assert.equal(r.deadlineMs, null);
  assert.equal(r.targetMs, null);
});

test('reserveMinutes / minUsefulMinutes / windowMinutes は上書きできる', () => {
  const r = resolveDeadline({ schedule: '33 0 * * *', nowMs: utc(2, 0), reserveMinutes: 30 });
  assert.equal(r.deadlineMs, utc(3, 0) + WINDOW_MINUTES * 60_000 - 30 * 60_000);
  const r2 = resolveDeadline({ schedule: '33 0 * * *', nowMs: utc(3, 50), minUsefulMinutes: 1 });
  assert.equal(r2.reason, 'ok', '閾値を下げれば締切を使える');
  const r3 = resolveDeadline({ schedule: '33 0 * * *', nowMs: utc(2, 0), windowMinutes: 0 });
  assert.equal(r3.deadlineMs, utc(3, 0) - RESERVE_MINUTES * 60_000, '窓を0にすると従来（点）と同じ');
});

test('余裕は「デプロイ〜CDN反映（実測約3分）」より長い', () => {
  // 打ち切り後に品質チェック→コミット→デプロイ→CDN伝播(60秒)が必要。
  // ここが実測を下回ると、定刻に通知しても古いデータを指してしまう。
  assert.ok(RESERVE_MINUTES >= 5, `RESERVE_MINUTES=${RESERVE_MINUTES} は短すぎます`);
});

// ── 実ファイルとの突き合わせ ──────────────────────────────────
test('SLOTS の cron が scrape.yml の schedule と一致する', () => {
  const yml = read('.github/workflows/scrape.yml');
  const block = /schedule:\n((?:\s*- cron: .*\n)+)/.exec(yml);
  assert.ok(block, 'scrape.yml の schedule を読み取れませんでした');
  const crons = [...block[1].matchAll(/- cron: '([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(
    crons, SLOTS.map(s => s.cron),
    'cron とスロット表がズレています（待機も打ち切りも効かなくなり、中途半端な時刻に通知が飛びます）'
  );
});

test('scrape.yml は目標時刻を手書きせず shared/scrapeDeadline.cjs から取る', () => {
  const yml = read('.github/workflows/scrape.yml');
  assert.ok(
    yml.includes('scrapeDeadline.cjs'),
    'ワークフローが共有モジュールを参照していません（対応表が二重管理に戻っています）'
  );
  assert.ok(
    !/case "\$\{\{ github\.event\.schedule \}\}" in/.test(yml),
    '古い TARGET_UTC の case 文が残っています（cron を変えたときにズレる原因）'
  );
});

test('スクレイパーが締切を受け取る作りになっている', () => {
  const idx = read('scraper/index.js');
  assert.ok(idx.includes("require('../shared/scrapeDeadline.cjs')"), '共有モジュールを読み込んでいません');
  assert.ok(idx.includes('SCRAPE_SCHEDULE'), 'cron を受け取る環境変数がありません');
  assert.ok(idx.includes('cutoff.reached()'), '打ち切りの判定を呼んでいません');
});

// ── 開始位置のずらし（打ち切りの偏りをなくす） ──────────────────
test('rotationOffset: 実行ごとに開始位置が変わる', () => {
  const offsets = [1, 2, 3, 4, 5].map(n => rotationOffset(50, { runNumber: n }));
  assert.equal(new Set(offsets).size, 5, '同じ位置から始まってしまっています');
  assert.ok(offsets.every(o => o >= 0 && o < 50));
});

test('rotationOffset: 実行を重ねればどの地本も先頭に来る（一度も更新されない地本を作らない）', () => {
  const N = 50;
  const seen = new Set();
  for (let run = 0; run < N; run++) seen.add(rotationOffset(N, { runNumber: run }));
  assert.equal(seen.size, N, `${N}回でも先頭に来ない地本があります（歩幅 ${ROTATION_STEP} が件数と互いに素でない可能性）`);
});

test('rotationOffset: 歩幅は地本数と互いに素', () => {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  assert.equal(gcd(ROTATION_STEP, 50), 1, 'ROTATION_STEP と地本数(50)が互いに素でないと一周しません');
});

test('rotationOffset: run number が無い環境でも範囲内に収まる', () => {
  const o = rotationOffset(50, { nowMs: Date.UTC(2026, 8, 15, 3, 0) });
  assert.ok(Number.isInteger(o) && o >= 0 && o < 50);
  // 8時間窓なので、同じ窓の中では同じ位置（1回の実行中にブレない）
  assert.equal(o, rotationOffset(50, { nowMs: Date.UTC(2026, 8, 15, 5, 0) }));
});

test('rotationOffset: 件数が0・1・不正でも落ちない', () => {
  assert.equal(rotationOffset(0, { runNumber: 7 }), 0);
  assert.equal(rotationOffset(1, { runNumber: 7 }), 0);
  assert.equal(rotationOffset(-5, { runNumber: 7 }), 0);
  assert.equal(rotationOffset(50, { runNumber: 'abc' }) >= 0, true);
});

// ── 前回データの引き継ぎ（打ち切りでイベントを消さない） ────────────
const KEYS = ['sapporo', 'tokyo', 'aichi', 'osaka', 'okinawa'];

test('keysNeedingCarryOver: 時間切れで見送った地本は前回データを引き継ぐ', () => {
  const got = keysNeedingCarryOver({ keys: KEYS, errors: {}, skippedKeys: ['osaka', 'okinawa'] });
  assert.deepEqual(got, ['osaka', 'okinawa']);
});

test('keysNeedingCarryOver: 取得失敗も同じ扱い', () => {
  const got = keysNeedingCarryOver({ keys: KEYS, errors: { tokyo: true }, skippedKeys: [] });
  assert.deepEqual(got, ['tokyo']);
});

test('keysNeedingCarryOver: 失敗と見送りが重なっても重複しない', () => {
  const got = keysNeedingCarryOver({ keys: KEYS, errors: { osaka: true }, skippedKeys: ['osaka', 'okinawa'] });
  assert.deepEqual(got, ['osaka', 'okinawa']);
});

test('keysNeedingCarryOver: 全部成功したら引き継ぎゼロ（新しいデータで置き換わる）', () => {
  assert.deepEqual(keysNeedingCarryOver({ keys: KEYS, errors: {}, skippedKeys: [] }), []);
});

test('keysNeedingCarryOver: 全部ダメなら全部引き継ぐ（イベントが消えない）', () => {
  const got = keysNeedingCarryOver({ keys: KEYS, errors: {}, skippedKeys: KEYS });
  assert.deepEqual(got, KEYS);
});

test('keysNeedingCarryOver: 並び順は keys のまま（出力順が入れ替わらない）', () => {
  const got = keysNeedingCarryOver({ keys: KEYS, errors: { okinawa: true }, skippedKeys: ['sapporo'] });
  assert.deepEqual(got, ['sapporo', 'okinawa']);
});

test('keysNeedingCarryOver: 引数が無くても落ちない', () => {
  assert.deepEqual(keysNeedingCarryOver(), []);
  assert.deepEqual(keysNeedingCarryOver({}), []);
});

// ── スクレイパー本体の作り ──────────────────────────────────
test('地本の取得タスクが50件あり、キーが重複していない', () => {
  const idx = read('scraper/index.js');
  const block = /const PREF_TASKS = \[([\s\S]*?)\n\];/.exec(idx);
  assert.ok(block, 'PREF_TASKS を読み取れませんでした');
  const keys = [...block[1].matchAll(/key: '(\w+)'/g)].map(m => m[1]);
  assert.equal(keys.length, 50, `地本の数が変わっています（${keys.length}件）`);
  assert.equal(new Set(keys).size, keys.length, 'キーが重複しています（出力が上書きされます）');
});

test('PREF_TASKS のキーは公開側の SUPPORTED_PREFECTURES に含まれる', () => {
  const idx = read('scraper/index.js');
  const keys = [...(/const PREF_TASKS = \[([\s\S]*?)\n\];/.exec(idx)[1]).matchAll(/key: '(\w+)'/g)].map(m => m[1]);
  const map = read('src/data/regionMap.js');
  const sup = /SUPPORTED_PREFECTURES = new Set\(\[([\s\S]*?)\]\)/.exec(map);
  assert.ok(sup, 'SUPPORTED_PREFECTURES を読み取れませんでした');
  const supported = new Set([...sup[1].matchAll(/'(\w+)'/g)].map(m => m[1]));
  for (const k of keys) {
    assert.ok(supported.has(k), `${k} が SUPPORTED_PREFECTURES にありません（公開側で表示されません）`);
  }
});

test('打ち切りは地本ループだけでなく重い処理すべてに効く', () => {
  const idx = read('scraper/index.js');
  // 案内所巡回・HQ探索・OCR補完・LLM再検査。どれか1つでも抜けると、
  // そこで時間を使い切って結局スロットに間に合わない。
  const hits = (idx.match(/cutoff(?:\.reached\(\)| && cutoff\.reached\(\))/g) || []).length;
  assert.ok(hits >= 5, `打ち切りの判定箇所が ${hits} か所しかありません`);
  assert.ok(idx.includes('timeCutoff.reached()'), 'LLM再検査に打ち切りが効いていません');
});

// ── 配信枠（窓）の扱い（2026-09-05 導入） ─────────────────────
// 運用は「08:00〜09:00 の間に掲載する」であって 08:00 ちょうどを狙うのではない。
// 点から窓へ変えたことで、締切が60分うしろへ延び、起動遅延の吸収幅も60分増えた。

test('slotWindowEndEpoch: 枠の終わりは開始 + WINDOW_MINUTES', () => {
  for (const slot of SLOTS) {
    const now = Date.UTC(2026, 8, 5, 12, 0, 0);
    assert.equal(
      slotWindowEndEpoch(slot, now),
      slotTargetEpoch(slot, now) + WINDOW_MINUTES * 60_000,
    );
  }
});

test('slotWindowEndEpoch: 日付をまたぐ枠でも開始より後になる', () => {
  // 08:00 枠は UTC 23:00 開始で、終わりは翌 UTC 日の 00:00。
  // 絶対時刻の文字列で持つと「now と同じ UTC 日付」で解決できず開始より前になる。
  const slot = SLOTS.find(s => s.labelJst === '08:00');
  const now  = Date.UTC(2026, 8, 5, 21, 0, 0);
  assert.ok(slotWindowEndEpoch(slot, now) > slotTargetEpoch(slot, now));
});

test('窓にしたぶん、締切は従来より WINDOW_MINUTES うしろへ延びる', () => {
  const nowMs = utc(1, 0);
  const wide   = resolveDeadline({ schedule: '33 0 * * *', nowMs });
  const narrow = resolveDeadline({ schedule: '33 0 * * *', nowMs, windowMinutes: 0 });
  assert.equal(wide.deadlineMs - narrow.deadlineMs, WINDOW_MINUTES * 60_000);
  // 取得に使える時間がそのぶん増える＝打ち切りで見送る地本が減る
  assert.equal(Math.round(wide.availableMinutes - narrow.availableMinutes), WINDOW_MINUTES);
});

test('起動遅延の吸収幅が実測 p75（122分）を超える', () => {
  // GitHub のスケジュール起動遅延は実測で中央値66分・p75 122分。
  // 「起動 + 本体60分」が枠の終わりまでに収まる遅延の上限を確認する。
  const BODY_MINUTES = 60;                      // スクレイプ本体（実測）
  const START_TO_WINDOW_END = 147 + WINDOW_MINUTES;   // cron から枠の終わりまで
  const tolerance = START_TO_WINDOW_END - BODY_MINUTES;
  assert.ok(tolerance >= 122, `吸収できる遅延は ${tolerance} 分で、実測 p75(122分) に届きません`);
});

test('scrape.yml が枠の終わりを見て「定刻外」を判定している', () => {
  // 枠の開始を過ぎただけで警告を出すと、想定どおりの配信まで「定刻外」になる。
  const yml = read('.github/workflows/scrape.yml');
  assert.ok(yml.includes('slotWindowEndEpoch'), 'scrape.yml が枠の終わりを取得していません');
  assert.ok(
    /WINDOW_END_EPOCH/.test(yml),
    'scrape.yml が枠の終わりを使って判定していません（開始超過だけで定刻外になります）',
  );
});
