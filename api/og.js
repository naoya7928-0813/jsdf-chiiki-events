// 動的 OGP 画像生成（イベント個別ページのシェア画像）。フィードバック§3-4。
// /event/:id 用に middleware.js が og:image をこの関数へ向ける（title/date/place/pref/cat をクエリで受け取る）。
// @vercel/og は既定で日本語フォントを持たないため、Google Fonts から
// 「実際に使う文字だけ」をサブセット取得して埋め込む（軽量・edge制限内）。
// 何らかの失敗時は静的アイコンへ 302 フォールバックし、シェアが必ず画像を得られるようにする。
//
// JSX は使わず、Satori が解釈する要素オブジェクト（{type, props}）を素の JS で組み立てる
// （api/*.jsx が関数として検出されない環境があるため .js に統一）。
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SITE = 'https://jsdf-chiiki-events.vercel.app';
const FALLBACK_IMG = `${SITE}/icons/icon-512.png`;

// Satori 用の軽量ハイパースクリプト（React 非依存）。children は文字列/配列/入れ子ノード可。
function h(type, props, ...children) {
  const flat = children.flat().filter(c => c !== null && c !== undefined && c !== false);
  return { type, props: { ...(props || {}), children: flat.length === 1 ? flat[0] : flat } };
}

// 指定テキストに必要なグリフだけを含む woff を Google Fonts から取得
async function loadSubsetFont(family, text, weight) {
  const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(url, {
    headers: {
      // woff（TTFに近い）を得るため古めの UA を送る（@vercel/og の定番手法）
      'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
    },
  }).then(r => r.text());
  const m = css.match(/src:\s*url\(([^)]+)\)/);
  if (!m) throw new Error('font url not found');
  return fetch(m[1]).then(r => r.arrayBuffer());
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const title = (searchParams.get('title') || '自衛隊地本イベント').slice(0, 60);
    const date  = (searchParams.get('date')  || '').slice(0, 40);
    const place = (searchParams.get('place') || '').slice(0, 40);
    const pref  = (searchParams.get('pref')  || '').slice(0, 12);
    const cat   = (searchParams.get('cat')   || '').slice(0, 12);

    const brand = '地本イベントナビ（非公式）';
    const allText = `${title}${date}${place}${pref}${cat}${brand}開催日会場地本カテゴリ ：〜・|`;
    const [bold, regular] = await Promise.all([
      loadSubsetFont('Noto+Sans+JP', allText, 700),
      loadSubsetFont('Noto+Sans+JP', allText, 400),
    ]);

    const flex = (extra) => ({ display: 'flex', ...extra });

    const tree = h('div', {
      style: flex({
        width: '100%', height: '100%', flexDirection: 'column',
        background: 'linear-gradient(135deg,#3b4a2f 0%,#4a5a38 55%,#5a6b45 100%)',
        color: '#fff', padding: '64px 72px', fontFamily: 'NotoR', justifyContent: 'space-between',
      }),
    },
      // 上部: カテゴリ / 地本バッジ
      h('div', { style: flex({ alignItems: 'center', gap: 16, fontSize: 30 }) },
        h('div', { style: flex({ alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.14)', borderRadius: 8, padding: '8px 18px' }) },
          cat ? h('span', { style: { fontFamily: 'NotoB' } }, cat) : null,
          pref ? h('span', {}, `${pref}地本`) : null,
        ),
      ),
      // 中央: タイトル + 日付/会場
      h('div', { style: flex({ flexDirection: 'column', gap: 22 }) },
        h('div', { style: flex({ fontSize: 60, fontFamily: 'NotoB', lineHeight: 1.25 }) }, title),
        h('div', { style: flex({ flexDirection: 'column', gap: 8, fontSize: 32 }) },
          date  ? h('div', { style: flex({}) }, `開催日：${date}`) : null,
          place ? h('div', { style: flex({}) }, `会場：${place}`) : null,
        ),
      ),
      // 下部: ブランド / ドメイン
      h('div', { style: flex({ justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 26 }) },
        h('div', { style: flex({}) }, brand),
        h('div', { style: flex({}) }, 'jsdf-chiiki-events.vercel.app'),
      ),
    );

    return new ImageResponse(tree, {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'NotoB', data: bold,    weight: 700, style: 'normal' },
        { name: 'NotoR', data: regular, weight: 400, style: 'normal' },
      ],
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (e) {
    return Response.redirect(FALLBACK_IMG, 302);
  }
}
