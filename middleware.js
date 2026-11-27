// 旧 Vercel 本番URLを現行 .jp へ恒久転送しつつ、イベント個別ページ
// （/event/:id）の OGP メタを動的に差し込む Edge Middleware。
// SPA は任意パスで同じ index.html を返すため、そのままだと共有プレビューが
// 全イベントで同じ（トップの汎用OGP）になる。ここで対象イベントの
// タイトル・日付・会場・動的OGP画像(/api/og)を index.html に注入して返す。
// フィードバック §1-2④（個別URL）＋ §3-4（動的OGP）。
//
// 2026-11-23 から title・説明・robots・構造化データ（Event/BreadcrumbList）と、JS なしでも読める本文も
// 差し込む（中身は shared/eventPage.cjs が唯一の出どころ）。本文は SPA が描画されると App.jsx が取り除く
// （同じ情報を SPA が表示する＝利用者と検索エンジンで内容は変わらない）。
// 公開データに無い ID（掲載終了・存在しない）は 404 を返す（手動イベント manual-* は SPA に任せる）。
// 実ユーザーにも注入済み HTML を返すが、SPA は URL を見て通常どおり詳細を描画するため
// 表示は変わらない。何らかの失敗時は素通し（return）して通常配信にフォールバックし、
// ページを決して壊さない。
import {
  PREF_LABELS, esc, buildEventPage, injectEventPage, injectNotFound, isManualEventId, mergePublished,
  isCompleteManualResponse, legacyEventRedirect,
} from './shared/eventPage.cjs';
import { siteUrl } from './shared/siteUrl.cjs';
// 会場名 → 開催地の都道府県（既知の駐屯地・基地）。構造化データの住所に使う
import { JSDF_FACILITIES } from './src/data/jsdfFacilities.js';

const LEGACY_PRODUCTION_HOST = 'jsdf-chiiki-events.vercel.app';
const CURRENT_ORIGIN = 'https://jsdf-chiiki-events.jp';

export const config = {
  // 旧ドメインは任意パスから転送する必要があるため全リクエストを対象にする。
  // 現行ドメインでは /event/:id 以外は直ちに素通しする。
  matcher: ['/:path*'],
};

export default async function middleware(request) {
  try {
    const url = new URL(request.url);

    // 公開用の旧 Vercel ドメインだけを 308 で現行 .jp へ移す。
    // Preview の *.vercel.app は検証用途なので巻き込まない。
    // パスとクエリは維持する（URL フラグメントはHTTPリクエストに送られないため対象外）。
    if (url.hostname.toLowerCase() === LEGACY_PRODUCTION_HOST) {
      const target = new URL(url.pathname + url.search, CURRENT_ORIGIN);
      return Response.redirect(target, 308);
    }

    const m = url.pathname.match(/^\/event\/([^/]+)\/?$/);
    if (!m) return; // 対象外は素通し
    let id;
    try { id = decodeURIComponent(m[1]); } catch { return; }
    const origin = url.origin;
    // canonical・構造化データの URL は公開URL（プレビュー環境で開いても本番を指す）
    const SITE = siteUrl(process.env);

    // events.json と、運営の手動イベント・上書き修正（/api/manual-events。CDN で60秒キャッシュ）を並行取得し、
    // アプリと同じ規則（shared/eventPage.cjs の mergePublished）で合流させる。
    // 上書き修正を当てないと、運営が直した日時・会場・中止が本文と構造化データに出ない
    const [raw, manual] = await Promise.all([
      fetch(`${origin}/data/events.json`, { headers: { 'cache-control': 'no-cache' } })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${origin}/api/manual-events`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (!raw) return; // 取得できないときは判断しない（誤って 404 にしない）
    const data = mergePublished(raw, manual);

    const html = await fetch(`${origin}/index.html`, { headers: { 'cache-control': 'no-cache' } })
      .then(r => (r.ok ? r.text() : null))
      .catch(() => null);
    if (!html) return;

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const page = buildEventPage(data, id, { siteUrl: SITE, today, facilities: JSDF_FACILITIES });

    if (!page) {
      // ID の引き継ぎ導入前に入れ替わって消えた旧URL（同じイベントと確認済みのものだけ）は今のURLへ 301
      const moved = legacyEventRedirect(data, id);
      if (moved) {
        return new Response(null, {
          status: 301,
          headers: { location: `${origin}${moved}`, 'cache-control': 'public, max-age=0, s-maxage=300' },
        });
      }
      // 手動入力イベント（manual-*）は /api/manual-events にある。取得できなかった（通信・Redis の障害）ときは
      // 判断できないので SPA に任せる。取得できたのに無い＝削除済み・下書きなので 404 にする
      // （以前は常に SPA に任せており、削除済みの URL が 200＋index で返るソフト404になっていた。2026-11-27）
      const manualId = isManualEventId(id);
      if (manualId && !isCompleteManualResponse(manual)) return;
      // 掲載終了（公開データから外れた）・存在しない ID。画面は SPA の404画面のまま、
      // HTTP ステータスを 404 にして検索エンジンに「このURLは無い」と伝える
      // （本文の SPA は自分でデータを取り直すので、利用者の表示は変わらない）
      const nf = injectNotFound(html);
      if (!nf) return;
      return new Response(nf, {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          // 手動イベントは /api/manual-events の CDN キャッシュ（60秒）だけ遅れて現れるので、404 も同じ長さに留める
          'cache-control': manualId ? 'public, max-age=0, s-maxage=60' : 'public, max-age=0, s-maxage=300',
          'x-robots-tag': 'noindex',
        },
      });
    }

    const { ev, prefKey } = page;
    const prefLabel = PREF_LABELS[prefKey] || prefKey;
    const cat = ev.category || '';
    const dateStr = ev.date ? (ev.endDate && ev.endDate !== ev.date ? `${ev.date}〜${ev.endDate}` : ev.date) : '';
    const place = ev.place || '';
    const ogImg = `${origin}/api/og?` + new URLSearchParams({
      title: ev.title || '自衛隊地本イベント',
      date: dateStr, place, pref: prefLabel, cat,
    }).toString();

    const ogBlock = `
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${esc(page.canonical)}" />
    <meta property="og:image" content="${esc(ogImg)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="ja_JP" />
    <link rel="canonical" href="${esc(page.canonical)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(page.title)}" />
    <meta name="twitter:description" content="${esc(page.description)}" />
    <meta name="twitter:image" content="${esc(ogImg)}" />`;

    const out = injectEventPage(html, page, { ogBlock });
    if (!out) return;
    return new Response(out, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // 実ユーザー/クローラー共通。イベントデータ更新に追従できるよう短め＋SWR。
        'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch {
    return; // 失敗時は通常配信にフォールバック
  }
}
