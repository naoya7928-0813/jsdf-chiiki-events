const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('./eventPage.cjs');

const SITE = 'https://jsdf-chiiki-events.jp';
const TODAY = '2026-11-23';
const root = f => path.join(__dirname, '..', f);

const base = (over = {}) => ({
  id: 't-20261205-abc', pref: 'tokyo', date: '2026-12-05', weekday: '土',
  title: '自衛隊音楽まつり', place: '日本武道館', address: '東京都千代田区北の丸公園2-3',
  time: '13:00～15:00', category: '演奏会', tag: '', url: 'https://www.mod.go.jp/pco/tokyo/x.html',
  notes: '', firstSeen: '2026-11-20',
  weatherLocation: { latitude: 35.693, longitude: 139.75, label: '東京都千代田区', accuracy: 'address' },
  ...over,
});

test('Event: 料金が資料に無ければ offers を出さない（一律0円にしない）', () => {
  const s = P.buildEventSchema(base(), { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' });
  assert.ok(s);
  assert.strictEqual(s.offers, undefined);
  assert.strictEqual(s.isAccessibleForFree, undefined);
});

test('Event: 「入場無料」と確認できたときだけ price 0（availability・validFrom は出さない）', () => {
  for (const ev of [base({ tag: '入場無料' }), base({ notes: '入場無料・事前申込不要' }), base({ title: '参加無料 体験イベント' })]) {
    const s = P.buildEventSchema(ev, { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' });
    assert.strictEqual(s.offers.price, '0');
    assert.strictEqual(s.offers.availability, undefined);
    assert.strictEqual(s.offers.validFrom, undefined);
    assert.strictEqual(s.isAccessibleForFree, true);
  }
  // 料金以外の「無料」は拾わない
  assert.strictEqual(P.isConfirmedFree(base({ notes: '無料駐車場あり。無料送迎バスを運行' })), false);
});

test('Event: 主催者・出演者・画像は推測で出さない', () => {
  const s = P.buildEventSchema(base(), { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' });
  assert.strictEqual(s.organizer, undefined);
  assert.strictEqual(s.performer, undefined);
  assert.strictEqual(s.image, undefined);
});

test('Event: 会場名・都道府県が分からない／掲載元の案内所名だけ のときは出さない（地本名で代用しない）', () => {
  const opt = { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' };
  assert.strictEqual(P.buildEventSchema(base({ place: '' }), opt), null);
  assert.strictEqual(P.buildEventSchema(base({ place: '江東出張所', notes: '掲載元: 江東出張所' }), opt), null);
  // 住所なし・座標が都道府県レベル（＝地本の担当県で補っただけ）
  assert.strictEqual(P.buildEventSchema(base({ address: '', weatherLocation: { label: '東京都', accuracy: 'prefecture' } }), opt), null);
  assert.strictEqual(P.buildEventSchema(base({ address: '', weatherLocation: undefined }), opt), null);
});

test('Event: 開催地の都道府県は住所（または会場の座標）から決める。掲載元の地本と別の県でもよい', () => {
  const ev = base({ address: '埼玉県朝霞市栄町4-1', place: '朝霞駐屯地' });
  const s = P.buildEventSchema(ev, { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' });
  assert.strictEqual(s.location.address.addressRegion, '埼玉県');
  assert.strictEqual(s.location.address.streetAddress, '埼玉県朝霞市栄町4-1');
  const v = P.eventAddress(base({ address: '', weatherLocation: { label: '北海道旭川市', accuracy: 'venue' } }));
  assert.strictEqual(v.addressRegion, '北海道');
  assert.strictEqual(v.addressLocality, undefined); // 会場名検索の座標は市区町村まで断定しない
});

test('Event: 終了済み・公式URLなし・不正タイトルは出さない。中止・延期は状態を反映', () => {
  const opt = { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' };
  assert.strictEqual(P.buildEventSchema(base({ date: '2026-11-01' }), opt), null);
  assert.strictEqual(P.buildEventSchema(base({ url: '' }), opt), null);
  assert.strictEqual(P.buildEventSchema(base({ title: '〒100-0001 東京都千代田区' }), opt), null);
  assert.strictEqual(P.buildEventSchema(base({ status: 'cancelled' }), opt).eventStatus, 'https://schema.org/EventCancelled');
  assert.strictEqual(P.buildEventSchema(base({ status: 'postponed' }), opt).eventStatus, 'https://schema.org/EventPostponed');
});

test('Event: url は当サイトの個別ページ、公式ページは sameAs。時刻がそろうときだけ時刻付き', () => {
  const s = P.buildEventSchema(base(), { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' });
  assert.strictEqual(s.url, `${SITE}/event/t-20261205-abc`);
  assert.strictEqual(s.sameAs, 'https://www.mod.go.jp/pco/tokyo/x.html');
  assert.strictEqual(s.startDate, '2026-12-05T13:00:00+09:00');
  assert.strictEqual(s.endDate, '2026-12-05T15:00:00+09:00');
  const d = P.buildEventSchema(base({ time: '13:00～' }), { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' });
  assert.strictEqual(d.startDate, '2026-12-05');
  assert.strictEqual(d.endDate, '2026-12-05');
});

const data = () => ({
  updatedAt: '2026/11/23 18:07',
  tokyo: [base(), base({ id: 't-20261101-old', date: '2026-11-10', title: '終わった説明会' }),
    base({ id: 't-20261210-x', date: '2026-12-10', title: '駐屯地見学会', category: '体験' })],
  saitama: [base({ id: 'st-1', pref: 'saitama', date: '2026-12-12', title: '自衛隊演奏会in川越', category: '演奏会' })],
});

test('個別ページ: ~2 接尾辞付きでも見つかる。無い ID は null', () => {
  assert.ok(P.buildEventPage(data(), 't-20261205-abc~2', { siteUrl: SITE, today: TODAY }));
  assert.strictEqual(P.buildEventPage(data(), 'nope', { siteUrl: SITE, today: TODAY }), null);
  assert.ok(P.isManualEventId('manual-tokyo-20261201-ab'));
});

test('個別ページ: 終了済み・公式URLなしは noindex', () => {
  const d = data();
  assert.strictEqual(P.buildEventPage(d, 't-20261205-abc', { siteUrl: SITE, today: TODAY }).robots, 'index, follow');
  assert.strictEqual(P.buildEventPage(d, 't-20261101-old', { siteUrl: SITE, today: TODAY }).robots, 'noindex, follow');
  d.tokyo[0].url = '';
  assert.strictEqual(P.buildEventPage(d, 't-20261205-abc', { siteUrl: SITE, today: TODAY }).robots, 'noindex, follow');
});

test('個別ページ: 本文に構造化データと同じ名前・日付・会場があり、掲載元・最終確認・関連イベントを出す', () => {
  const page = P.buildEventPage(data(), 't-20261205-abc', { siteUrl: SITE, today: TODAY });
  const ev = page.jsonLd.find(x => x['@type'] === 'Event');
  assert.ok(page.article.includes(`<h1>${ev.name}</h1>`));
  assert.ok(page.article.includes('2026年12月5日（土）'));
  assert.ok(page.article.includes(ev.location.name));
  assert.ok(page.article.includes('掲載元'));
  assert.ok(page.article.includes('2026/11/23 18:07'));
  assert.ok(page.article.includes('/event/t-20261210-x'));      // 同じ地本の関連イベント
  assert.ok(!page.article.includes('/event/t-20261101-old'));   // 終了済みは関連に出さない
  assert.ok(page.article.includes('google.com/maps/search'));
  assert.ok(page.jsonLd.some(x => x['@type'] === 'BreadcrumbList'));
});

test('個別ページ: index.html へ title・description・robots・OG・JSON-LD・本文を差し込む', () => {
  const html = fs.readFileSync(root('index.html'), 'utf8');
  const page = P.buildEventPage(data(), 't-20261205-abc', { siteUrl: SITE, today: TODAY });
  const out = P.injectEventPage(html, page, { ogBlock: `<link rel="canonical" href="${page.canonical}" />` });
  assert.ok(out);
  assert.ok(out.includes(`<title>${P.esc(page.title)}</title>`));
  assert.ok(out.includes(`content="${P.esc(page.description)}"`));
  assert.ok(out.includes('<meta name="robots" content="index, follow" />'));
  assert.strictEqual((out.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(out.includes('"@type":"Event"'));
  assert.ok(out.indexOf('id="ssr-event"') < out.indexOf('<div id="root">'));
  // 目印が無い HTML は壊さず null
  assert.strictEqual(P.injectEventPage('<html></html>', page, {}), null);
});

test('個別ページ: タイトルに </script> や HTML が入っても壊れない', () => {
  const d = data();
  d.tokyo[0].title = '説明会</script><img src=x onerror=alert(1)>';
  const page = P.buildEventPage(d, 't-20261205-abc', { siteUrl: SITE, today: TODAY });
  const out = P.injectEventPage(fs.readFileSync(root('index.html'), 'utf8'), page, {});
  assert.ok(!out.includes('<img src=x'));
  assert.ok(!/<\/script><img/.test(out));
});

test('404: robots を noindex にする', () => {
  const out = P.injectNotFound(fs.readFileSync(root('index.html'), 'utf8'));
  assert.ok(out.includes('<meta name="robots" content="noindex, follow" />'));
});

test('weekendRange: 平日→次の土日 / 土曜→当日と翌日 / 日曜→当日のみ', () => {
  assert.deepStrictEqual(P.weekendRange('2026-11-25'), { sat: '2026-11-28', sun: '2026-11-29' });
  assert.deepStrictEqual(P.weekendRange('2026-11-28'), { sat: '2026-11-28', sun: '2026-11-29' });
  assert.deepStrictEqual(P.weekendRange('2026-11-29'), { sat: '2026-11-29', sun: '2026-11-29' });
  assert.ok(P.isWeekendEvent(base({ date: '2026-11-27', endDate: '2026-11-28' }), '2026-11-25'));
  assert.ok(!P.isWeekendEvent(base({ date: '2026-11-30' }), '2026-11-25'));
});

test('lastmod: 初回掲載・照合・開催状況の更新・変更登録の最も新しい日', () => {
  assert.strictEqual(P.eventLastmod({ firstSeen: '2026-11-01' }), '2026-11-01');
  assert.strictEqual(P.eventLastmod({ firstSeen: '2026-11-01', verifiedAt: '2026-11-05T08:00:00Z',
    statusUpdatedAt: '2026-11-03T00:00:00+09:00', changes: [{ at: '2026-11-07T10:00:00+09:00' }] }), '2026-11-07');
  assert.strictEqual(P.eventLastmod({}), '');
});

test('配線: middleware は共通モジュールを使い、App は本文をアプリ描画時に外す', () => {
  const mw = fs.readFileSync(root('middleware.js'), 'utf8');
  assert.ok(mw.includes("from './shared/eventPage.cjs'"));
  assert.ok(/status:\s*404/.test(mw));
  const app = fs.readFileSync(root('src/App.jsx'), 'utf8');
  assert.ok(app.includes("getElementById('ssr-event')"));
});

test('一覧ページには Event 構造化データを置かない（個別ページにだけ置く）', () => {
  const files = ['public/events.html', ...fs.readdirSync(root('public/events')).map(f => `public/events/${f}`),
    ...fs.readdirSync(root('public/topics')).map(f => `public/topics/${f}`)];
  for (const f of files) {
    const html = fs.readFileSync(root(f), 'utf8');
    assert.ok(!html.includes('"@type":"Event"'), `${f} に Event が残っている`);
  }
});

test('開催地: 会場名が既知の基地なら施設の都道府県（地本の県や偏った座標より優先）', () => {
  const facilities = [{ pref: 'aomori', name: '航空自衛隊 三沢基地', address: '青森県三沢市' }];
  const ev = { place: '県の航空自衛隊三沢基地', address: '',
    weatherLocation: { label: '北海道函館市', accuracy: 'venue' } };
  const a = P.eventAddress(ev, { facilities });
  assert.strictEqual(a.addressRegion, '青森県');
  assert.strictEqual(a.addressLocality, '三沢市');
  // 施設一覧が無くても、「県の」で始まる（別の県名の断片）なら地本寄りの座標は使わない
  assert.strictEqual(P.eventAddress(ev), null);
  assert.strictEqual(P.eventAddress({ place: '青森県の三沢基地', weatherLocation: { label: '北海道函館市', accuracy: 'venue' } }), null);
});

test('ファイル名の日付より9か月以上あとの開催日は検索対象にしない（過年度資料・誤読）', () => {
  const ev = base({ date: '2027-02-08', url: 'https://www.mod.go.jp/pco/hakodate/news/img/R7xxxx20260216.pdf' });
  assert.strictEqual(P.hasDateStampConflict(ev), true);
  assert.strictEqual(P.isEventIndexable(ev, TODAY), false);
  assert.strictEqual(P.hasDateStampConflict(base({ date: '2026-12-05', url: 'https://x.jp/flyer20261101.pdf' })), false);
  assert.strictEqual(P.hasDateStampConflict(base()), false);
});

test('mergePublished: 運営の上書き修正（中止・日時変更）と手動イベントを合流し、個別ページに反映する', () => {
  const d = data();
  const merged = P.mergePublished(d, {
    events: [{ id: 'manual-tokyo-20261220-ab', pref: 'tokyo', date: '2026-12-20', title: '運営登録の説明会', place: '市ヶ谷駐屯地',
      url: 'https://www.mod.go.jp/pco/tokyo/m.html', address: '東京都新宿区市谷本村町5-1' }],
    overrides: { 't-20261205-abc': { status: 'cancelled', date: '2026-12-06' } },
  });
  assert.strictEqual(d.tokyo[0].status, undefined); // 元データは変えない
  const page = P.buildEventPage(merged, 't-20261205-abc', { siteUrl: SITE, today: TODAY });
  const ev = page.jsonLd.find(x => x['@type'] === 'Event');
  assert.strictEqual(ev.eventStatus, 'https://schema.org/EventCancelled');
  assert.ok(ev.startDate.startsWith('2026-12-06'));
  assert.ok(page.article.includes('中止'));
  assert.ok(P.buildEventPage(merged, 'manual-tokyo-20261220-ab', { siteUrl: SITE, today: TODAY }));
  // 取得できなかった（null）ときはそのまま
  assert.deepStrictEqual(P.mergePublished(d, null), { ...d });
});

test('配線: middleware とアプリは同じ mergePublished で上書き修正を当てる', () => {
  assert.ok(fs.readFileSync(root('middleware.js'), 'utf8').includes('mergePublished(raw, manual)'));
  assert.ok(fs.readFileSync(root('src/hooks/useEvents.js'), 'utf8').includes('mergePublished(json, manualResp)'));
});

test('Event: 出演者はイベント名に特定できる音楽隊名があるときだけ（総称・推測では出さない）', () => {
  const opt = { siteUrl: SITE, today: TODAY, prefKey: 'tokyo' };
  const s1 = P.buildEventSchema(base({ title: '陸上自衛隊東北方面音楽隊演奏会2027in秋田' }), opt);
  assert.deepStrictEqual(s1.performer, { '@type': 'PerformingGroup', name: '陸上自衛隊東北方面音楽隊' });
  assert.deepStrictEqual(P.explicitPerformers({ title: '【高崎市】第12音楽隊クリスマスファミリーコンサート' }).map(p => p.name), ['第12音楽隊']);
  assert.deepStrictEqual(P.explicitPerformers({ title: '茨城地本枠 航空中央音楽隊クリスマスコンサート' }).map(p => p.name), ['航空中央音楽隊']);
  assert.deepStrictEqual(P.explicitPerformers({ title: '海上自衛隊東京音楽隊 定期演奏会' }).map(p => p.name), ['海上自衛隊東京音楽隊']);
  // どの部隊か分からない総称・回数・地名だけ・演奏会という種目だけでは出さない
  for (const title of ['自衛隊音楽隊ふれあいコンサートin今治', '陸上自衛隊音楽隊', '第1回音楽隊フェス', '今治市音楽隊', '富山自衛隊演奏会']) {
    assert.deepStrictEqual(P.explicitPerformers({ title }), [], title);
  }
  assert.strictEqual(P.buildEventSchema(base({ title: '富山自衛隊演奏会', category: '演奏会' }), opt).performer, undefined);
  // 備考に書かれた音楽隊からは推測しない（イベント名だけを見る）
  assert.strictEqual(P.buildEventSchema(base({ notes: '出演: 第1音楽隊' }), opt).performer, undefined);
});

test('手動イベントの404判定: /api/manual-events を最後まで読めたときだけ「無い」と判断する', () => {
  assert.strictEqual(P.isCompleteManualResponse({ events: [], overrides: {}, complete: true }), true);
  // Redis 障害時の応答（complete なし）・取得失敗（null）・形の違うもの
  assert.strictEqual(P.isCompleteManualResponse({ events: [] }), false);
  assert.strictEqual(P.isCompleteManualResponse(null), false);
  assert.strictEqual(P.isCompleteManualResponse({ complete: true }), false);
  const api = fs.readFileSync(root('api/manual-events.js'), 'utf8');
  assert.match(api, /json\(\{ events, overrides, complete: true \}\)/, '成功時だけ complete を付けること');
  assert.match(api, /catch \(err\) \{[\s\S]*?json\(\{ events: \[\] \}\)/, '失敗時の応答に complete を付けないこと');
});

// middleware を実際に動かして HTTP ステータス・robots・canonical の組み合わせを確かめる（fetch は偽物）
test('middleware: 掲載中は200＋index＋canonical、無いIDは404＋noindex、手動イベントは取得できたときだけ404', async () => {
  const { pathToFileURL } = require('node:url');
  const mw = (await import(pathToFileURL(root('middleware.js')).href)).default;
  const html = fs.readFileSync(root('index.html'), 'utf8');
  const future = '2099-12-05';
  const events = { updatedAt: '2026/11/27 05:00', tokyo: [base({ id: 'to-20991205-abc', date: future })] };
  const run = async (path, { manual = { events: [], overrides: {}, complete: true } } = {}) => {
    const orig = global.fetch;
    global.fetch = async (u) => {
      const p = new URL(u).pathname;
      if (p === '/data/events.json') return new Response(JSON.stringify(events), { status: 200 });
      if (p === '/api/manual-events') return manual === 'fail' ? new Response('', { status: 500 }) : new Response(JSON.stringify(manual), { status: 200 });
      if (p === '/index.html') return new Response(html, { status: 200 });
      return new Response('', { status: 404 });
    };
    try { return await mw(new Request(`https://jsdf-chiiki-events.jp${path}`)); } finally { global.fetch = orig; }
  };
  const ok = await run('/event/to-20991205-abc');
  assert.strictEqual(ok.status, 200);
  const body = await ok.text();
  assert.match(body, /<meta name="robots" content="index, follow"/);
  assert.match(body, /<link rel="canonical" href="https:\/\/jsdf-chiiki-events\.jp\/event\/to-20991205-abc"/);
  assert.match(body, /"@type":"Event"/);

  const gone = await run('/event/to-20240101-old');
  assert.strictEqual(gone.status, 404);
  assert.match(await gone.text(), /<meta name="robots" content="noindex, follow"/);

  // 手動イベント: 一覧を読めて無ければ 404（削除済み・下書き）。短いキャッシュ
  const mGone = await run('/event/manual-deleted');
  assert.strictEqual(mGone.status, 404);
  assert.match(mGone.headers.get('cache-control'), /s-maxage=60/);
  // 一覧を読めなかった（障害で complete なし／HTTPエラー）ときは判断せず素通し（SPA に任せる）
  assert.strictEqual(await run('/event/manual-deleted', { manual: { events: [] } }), undefined);
  assert.strictEqual(await run('/event/manual-deleted', { manual: 'fail' }), undefined);
  // 手動イベントが一覧にあれば個別ページ
  const mOk = await run('/event/manual-1', { manual: { events: [base({ id: 'manual-1', date: future })], overrides: {}, complete: true } });
  assert.strictEqual(mOk.status, 200);
  // 対象外のパスは素通し
  assert.strictEqual(await run('/list'), undefined);
});
