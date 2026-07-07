// イベント個別ページ（/event/:id）の OGP メタを動的に差し込む Edge Middleware。
// SPA は任意パスで同じ index.html を返すため、そのままだと共有プレビューが
// 全イベントで同じ（トップの汎用OGP）になる。ここで対象イベントの
// タイトル・日付・会場・動的OGP画像(/api/og)を index.html に注入して返す。
// フィードバック §1-2④（個別URL）＋ §3-4（動的OGP）。
//
// 実ユーザーにも注入済み HTML を返すが、SPA は URL を見て通常どおり詳細を描画するため
// 表示は変わらない。何らかの失敗時は素通し（return）して通常配信にフォールバックし、
// ページを決して壊さない。
export const config = {
  matcher: ['/event/:id*'],
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PREF_LABELS = {
  sapporo: '札幌', asahikawa: '旭川', obihiro: '帯広', hakodate: '函館',
  aomori: '青森', iwate: '岩手', miyagi: '宮城', akita: '秋田', yamagata: '山形', fukushima: '福島',
  ibaraki: '茨城', tochigi: '栃木', gunma: '群馬', saitama: '埼玉', chiba: '千葉', tokyo: '東京', kanagawa: '神奈川',
  niigata: '新潟', toyama: '富山', ishikawa: '石川', fukui: '福井', yamanashi: '山梨', nagano: '長野',
  gifu: '岐阜', shizuoka: '静岡', aichi: '愛知',
  mie: '三重', shiga: '滋賀', kyoto: '京都', osaka: '大阪', hyogo: '兵庫', nara: '奈良', wakayama: '和歌山',
  tottori: '鳥取', shimane: '島根', okayama: '岡山', hiroshima: '広島', yamaguchi: '山口',
  tokushima: '徳島', kagawa: '香川', ehime: '愛媛', kochi: '高知',
  fukuoka: '福岡', saga: '佐賀', nagasaki: '長崎', kumamoto: '熊本', oita: '大分', miyazaki: '宮崎', kagoshima: '鹿児島', okinawa: '沖縄',
};

export default async function middleware(request) {
  try {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/event\/([^/]+)\/?$/);
    if (!m) return; // 対象外は素通し
    const id = decodeURIComponent(m[1]);
    const origin = url.origin;

    // events.json から対象イベントを探す（手動イベントは Redis 側のため見つからなければ汎用にフォールバック）
    const data = await fetch(`${origin}/data/events.json`, { headers: { 'cache-control': 'no-cache' } })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!data) return;

    let ev = null, prefKey = '';
    for (const [k, arr] of Object.entries(data)) {
      if (!Array.isArray(arr)) continue;
      // 一覧側で重複IDに付く接尾辞（~2 等）を無視して基底IDで照合
      const found = arr.find(e => e && (e.id === id || `${e.id}` === id.replace(/~\d+$/, '')));
      if (found) { ev = found; prefKey = k; break; }
    }
    if (!ev) return; // 見つからなければ通常配信（汎用OGP）

    // index.html を取得して OG ブロックを差し替える
    const html = await fetch(`${origin}/index.html`, { headers: { 'cache-control': 'no-cache' } })
      .then(r => (r.ok ? r.text() : null))
      .catch(() => null);
    if (!html) return;
    const START = '<!--OG:START-->', END = '<!--OG:END-->';
    const s = html.indexOf(START), e = html.indexOf(END);
    if (s === -1 || e === -1 || e < s) return;

    const prefLabel = PREF_LABELS[prefKey] || prefKey;
    const cat = ev.category || '';
    const dateStr = ev.date ? (ev.endDate && ev.endDate !== ev.date ? `${ev.date}〜${ev.endDate}` : ev.date) : '';
    const place = ev.place || '';
    const pageUrl = `${origin}/event/${encodeURIComponent(id)}`;
    const title = `${ev.title || '自衛隊地本イベント'}｜${prefLabel}地本`;
    const descParts = [dateStr && `開催日 ${dateStr}`, place && `会場 ${place}`, cat, `${prefLabel}地本の自衛隊イベント（非公式まとめ）`].filter(Boolean);
    const desc = descParts.join(' ／ ');

    const ogImg = `${origin}/api/og?` + new URLSearchParams({
      title: ev.title || '自衛隊地本イベント',
      date: dateStr, place, pref: prefLabel, cat,
    }).toString();

    const injected = `${START}
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${esc(pageUrl)}" />
    <meta property="og:image" content="${esc(ogImg)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="ja_JP" />
    <link rel="canonical" href="${esc(pageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${esc(ogImg)}" />${END}`;

    const out = html.slice(0, s) + injected + html.slice(e + END.length);
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
