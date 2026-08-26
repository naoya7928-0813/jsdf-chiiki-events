'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  CATEGORIES,
  EVENT_JSON_SCHEMA,
  isRealDateStr,
  normalizeDate,
  normalizeLlmEvent,
  schemaIssues,
  titleIssues,
  isPublishable,
  decideRecheck,
  hasRepeatedPhrase,
  TITLE_MAX_LEN,
  sameValue,
  mergeRecheck,
  buildTextExtractPrompt,
  buildRecheckPrompt,
} = require('./llmExtract.cjs');

// ── スキーマ ───────────────────────────────────────────────────
test('スキーマは全フィールドで null を許す（資料に無ければ null にさせるため）', () => {
  for (const [name, spec] of Object.entries(EVENT_JSON_SCHEMA.properties)) {
    assert.ok(spec.type.includes('null'), `${name} が null を許していない`);
  }
});

test('category の enum は固定9値 + null', () => {
  assert.deepStrictEqual(
    EVENT_JSON_SCHEMA.properties.category.enum,
    [...CATEGORIES, null]
  );
});

// ── 日付 ───────────────────────────────────────────────────────
test('実在しない日付を弾く', () => {
  assert.ok(isRealDateStr('2026-02-28'));
  assert.ok(!isRealDateStr('2026-02-30'));
  assert.ok(!isRealDateStr('2026-13-01'));
  assert.ok(!isRealDateStr('2026/02/01'));
});

test('和暦・区切り揺れを YYYY-MM-DD に寄せる', () => {
  assert.strictEqual(normalizeDate('令和8年8月22日'), '2026-08-22');
  assert.strictEqual(normalizeDate('2026年8月22日（土）'), '2026-08-22');
  assert.strictEqual(normalizeDate('2026/8/22'), '2026-08-22');
  assert.strictEqual(normalizeDate('2026.8.22'), '2026-08-22');
  assert.strictEqual(normalizeDate('８月２２日'), null, '年が無ければ null');
  assert.strictEqual(normalizeDate(''), null);
});

// ── 正規化: 規定外は捨てて null ────────────────────────────────
test('規定外の値は採用せず null にする', () => {
  const ev = normalizeLlmEvent({
    title: '自衛隊音楽まつり',
    date: '2026-09-01',
    time: '午前10時ごろ',          // 規定書式でない
    category: '花火大会',           // 固定9値でない
    tag: 'よくわからない',           // 規定値でない
    deadline: '定員に達し次第',      // 日付でない
    url: 'javascript:alert(1)',     // http(s) でない
  });
  assert.strictEqual(ev.time, null);
  assert.strictEqual(ev.category, null);
  assert.strictEqual(ev.tag, null);
  assert.strictEqual(ev.deadline, null);
  assert.strictEqual(ev.url, null);
  assert.strictEqual(ev.title, '自衛隊音楽まつり');
});

test('"なし"・空文字・"null" 文字列は null に潰す', () => {
  const ev = normalizeLlmEvent({ title: 'A説明会', date: '2026-09-01', place: 'なし', notes: '', address: 'null' });
  assert.strictEqual(ev.place, null);
  assert.strictEqual(ev.notes, null);
  assert.strictEqual(ev.address, null);
});

test('endDate が date より前なら無かったことにする', () => {
  const ev = normalizeLlmEvent({ title: 'A説明会', date: '2026-09-10', endDate: '2026-09-01' });
  assert.strictEqual(ev.endDate, null);
});

test('正規化を通した結果はスキーマ違反を残さない', () => {
  const ev = normalizeLlmEvent({
    title: '海上自衛隊艦艇公開', date: '2026-09-01', endDate: '2026-09-02',
    time: '10:00～16:00', category: '艦艇公開', deadline: '8月20日（木）',
  });
  assert.deepStrictEqual(schemaIssues(ev), []);
});

test('schemaIssues は書式違反を検出する', () => {
  const issues = schemaIssues({ date: '2026-02-30', time: '10時', category: '花火', tag: 'x', deadline: '8/20' });
  assert.ok(issues.length >= 5, issues.join(' / '));
});

// ── タイトルらしくない値の検知（再検査トリガー） ────────────────
test('タイトルでない値を検知する', () => {
  const bad = [
    'https://www.mod.go.jp/pco/aomori/',
    '10:00～16:00',
    '2026年9月1日',
    '〒030-0801 青森市新町2-4-25',
    '017-776-1594',
    '海上自衛隊',
    '乗艦受付時刻',
    '主催: 青森地方協力本部',
  ];
  for (const t of bad) {
    assert.ok(!titleIssues(t).ok, `タイトルでない値を通してしまった: ${t}`);
  }
});

test('正規のイベント名は通す', () => {
  const good = [
    '自衛隊音楽まつり2026',
    '護衛艦「いずも」一般公開',
    '陸上自衛隊高等工科学校 学校説明会',
    '自衛官候補生募集説明会in青森',
  ];
  for (const t of good) {
    assert.ok(titleIssues(t).ok, `正規タイトルを弾いてしまった: ${t} → ${titleIssues(t).reasons.join(',')}`);
  }
});

// ── 掲載可否 ───────────────────────────────────────────────────
test('title / date が欠けたら掲載不可', () => {
  assert.ok(isPublishable({ title: 'A説明会', date: '2026-09-01' }));
  assert.ok(!isPublishable({ title: null, date: '2026-09-01' }));
  assert.ok(!isPublishable({ title: 'A説明会', date: null }));
  assert.ok(!isPublishable({ title: 'A説明会', date: '2026-02-30' }));
});

// ── 段2の判定 ──────────────────────────────────────────────────
test('規定どおりのイベントは ok', () => {
  const d = decideRecheck({ title: '自衛隊音楽まつり2026', date: '2026-09-01', time: '10:00～16:00', category: '演奏会' });
  assert.strictEqual(d.action, 'ok', d.reasons.join(','));
});

test('タイトルらしくない値は recheck', () => {
  const d = decideRecheck({ title: 'イーストピアみやこ 2階 多目的ホール', date: '2026-09-01', imageUrl: 'https://example.jp/a.jpg' });
  assert.strictEqual(d.action, 'recheck');
  assert.ok(d.hasSource);
});

test('確実に不正なタイトルは再検査せず junk', () => {
  const d = decideRecheck({ title: '〒030-0801 青森市新町2-4-25', date: '2026-09-01', url: 'https://example.jp/a.pdf' });
  assert.strictEqual(d.action, 'junk');
});

test('一次ソースが無ければ hasSource=false を返す', () => {
  const d = decideRecheck({ title: '乗艦受付時刻', date: '2026-09-01' });
  assert.strictEqual(d.hasSource, false);
});

test('任意項目の書式ズレでは再検査しない（整形で直すべきもの）', () => {
  // ここを再検査条件にすると、実データ179件中175件が対象になり上限を食い潰す
  const d = decideRecheck({ title: '自衛隊音楽まつり2026', date: '2026-09-01', time: '10時から', url: 'https://example.jp/a.pdf' });
  assert.strictEqual(d.action, 'ok', d.reasons.join(','));
  assert.ok(d.formatIssues.includes('time が規定書式でない'), '書式ズレ自体は記録される');
});

test('欠損を空文字で持つ既存データを「規定外の値」と誤判定しない', () => {
  const ev = { title: '自衛隊音楽まつり2026', date: '2026-09-01', time: '', tag: '', category: '', deadline: '', place: '' };
  assert.deepStrictEqual(schemaIssues(ev), []);
  assert.strictEqual(decideRecheck(ev).action, 'ok');
});

test('開催日が取れていなければ再検査', () => {
  const d = decideRecheck({ title: '自衛隊音楽まつり2026', date: '', url: 'https://example.jp/a.pdf' });
  assert.strictEqual(d.action, 'recheck');
  assert.ok(d.reasons.some(r => /date/.test(r)));
});

test('項目ラベルが混ざったタイトルを検知する', () => {
  const t = '若狭高校祭り 場 所：若狭高等学校 内 容：自衛隊車両展示・広報ブース等 =NEW= ～ 越前モノづくりフェスタ';
  const d = decideRecheck({ title: t, date: '2026-08-29', url: 'https://example.jp/a.html' });
  assert.strictEqual(d.action, 'recheck');
  assert.ok(d.reasons.some(r => /ラベル/.test(r)), d.reasons.join(','));
});

test('同じ語句の繰り返し（複数イベントの連結）を検知する', () => {
  assert.ok(hasRepeatedPhrase('「公務員合同説明会in豊岡」 「公務員合同説明会in豊岡」 「公務員合同説明会in長田」'));
  assert.ok(!hasRepeatedPhrase('自衛隊音楽まつり2026'));
  assert.ok(!hasRepeatedPhrase('護衛艦「いずも」一般公開'));
});

test('タイトル長の上限はQAスクリプトと揃える', () => {
  assert.strictEqual(TITLE_MAX_LEN, 45);
});

// ── 段3の突合 ──────────────────────────────────────────────────
test('全半角・空白の揺れは差異とみなさない', () => {
  assert.ok(sameValue('２０２６ 説明会', '2026説明会'));
  assert.ok(sameValue(null, ''));
  assert.ok(!sameValue('A会館', 'B会館'));
});

test('再抽出の値を採用し、変更点を記録する', () => {
  const { merged, changes } = mergeRecheck(
    { id: 'x', pref: 'aomori', title: '海上自衛隊', date: '2026-09-01', place: 'A会館' },
    { title: '護衛艦「てんりゅう」一般公開', date: '2026-09-01', place: 'A会館', endDate: null }
  );
  assert.strictEqual(merged.title, '護衛艦「てんりゅう」一般公開');
  assert.strictEqual(merged.id, 'x', '管理フィールドは触らない');
  assert.strictEqual(merged.pref, 'aomori');
  assert.deepStrictEqual(changes.map(c => c.field), ['title']);
  assert.strictEqual(merged.verifiedBy, 'llm-recheck');
});

test('再抽出が null を返したフィールドは元の値を残さない（裏付けの無い情報を消す）', () => {
  const { merged } = mergeRecheck(
    { title: 'A説明会', date: '2026-09-01', time: '10:00～16:00', place: 'A会館' },
    { title: 'A説明会', date: '2026-09-01', time: null, place: 'A会館' }
  );
  assert.strictEqual(merged.time, null);
});

test('再抽出で title が null なら掲載不可になる（→ 検疫へ）', () => {
  const { merged } = mergeRecheck(
    { title: '乗艦受付時刻', date: '2026-09-01' },
    { title: null, date: null }
  );
  assert.ok(!isPublishable(merged));
});

test('差異が無ければ verifiedBy を付けない', () => {
  const { merged, changes } = mergeRecheck(
    { title: 'A説明会', date: '2026-09-01' },
    { title: 'A説明会', date: '2026-09-01' }
  );
  assert.strictEqual(changes.length, 0);
  assert.strictEqual(merged.verifiedBy, undefined);
});

// ── プロンプト ─────────────────────────────────────────────────
test('プロンプトに「無ければ null」ルールと固定9値が含まれる', () => {
  for (const p of [buildTextExtractPrompt({ prefLabel: '青森地本', today: '2026-08-26' }), buildRecheckPrompt({})]) {
    assert.ok(p.includes('必ず null'), 'null ルールが無い');
    assert.ok(p.includes('推測'), '推測禁止の文言が無い');
    for (const c of CATEGORIES) assert.ok(p.includes(c), `カテゴリ ${c} が無い`);
  }
});
