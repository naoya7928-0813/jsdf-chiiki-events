// 動的 OGP 画像生成（イベント個別ページのシェア画像）。フィードバック§3-4。
// /event/:id 用に middleware.js が og:image をこの関数へ向ける（title/date/place/pref/cat をクエリで受け取る）。
// @vercel/og は既定で日本語フォントを持たないため、Google Fonts から
// 「実際に使う文字だけ」をサブセット取得して埋め込む（軽量・edge制限内）。
// 何らかの失敗時は静的アイコンへ 302 フォールバックし、シェアが必ず画像を得られるようにする。
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SITE = 'https://jsdf-chiiki-events.vercel.app';
const FALLBACK_IMG = `${SITE}/icons/icon-512.png`;

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
  const fontData = await fetch(m[1]).then(r => r.arrayBuffer());
  return fontData;
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
    // フォントに渡す全文字（サブセット対象）
    const allText = `${title}${date}${place}${pref}${cat}${brand}開催地カテゴリ ・|`;
    const [bold, regular] = await Promise.all([
      loadSubsetFont('Noto+Sans+JP', allText, 700),
      loadSubsetFont('Noto+Sans+JP', allText, 400),
    ]);

    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg,#3b4a2f 0%,#4a5a38 55%,#5a6b45 100%)',
          color: '#fff', padding: '64px 72px', fontFamily: 'NotoR', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, opacity: 0.92 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.14)', borderRadius: 8, padding: '8px 18px',
            }}>
              {cat && <span style={{ fontFamily: 'NotoB' }}>{cat}</span>}
              {pref && <span>{pref}地本</span>}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ fontSize: 60, fontFamily: 'NotoB', lineHeight: 1.25, display: 'flex' }}>
              {title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 32, opacity: 0.95 }}>
              {date  && <div style={{ display: 'flex' }}>開催日：{date}</div>}
              {place && <div style={{ display: 'flex' }}>会場：{place}</div>}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 26, opacity: 0.85 }}>
            <div style={{ display: 'flex' }}>{brand}</div>
            <div style={{ display: 'flex' }}>jsdf-chiiki-events.vercel.app</div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          { name: 'NotoB', data: bold,    weight: 700, style: 'normal' },
          { name: 'NotoR', data: regular, weight: 400, style: 'normal' },
        ],
        headers: {
          // 画像はイベント内容が変わらない限り不変。CDNで長めにキャッシュ。
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        },
      },
    );
  } catch (e) {
    // 生成失敗時はブランド静的画像へフォールバック（シェアが必ず画像を得る）
    return Response.redirect(FALLBACK_IMG, 302);
  }
}
