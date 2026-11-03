'use strict';

function decodeHtml(buffer, headers = {}) {
  const ascii = Buffer.from(buffer).toString('latin1');
  const charset = String(headers['content-type'] || '').match(/charset\s*=\s*([\w-]+)/i)?.[1]
    || ascii.slice(0, 5000).match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(buffer); }
  catch { return new TextDecoder('utf-8').decode(buffer); }
}

/**
 * 転送用ページ（<meta http-equiv="refresh" content="0; url=…">）の転送先を返す。
 * 2026-11: 宮城地本のトップ（/pco/miyagi/）は中身の無い転送用ページで、本物は /pco/miyagi/miyagitop/index.html。
 * 転送前の URL を基準にリンクを組み立てると「/pco/miyagi/event.html」のような存在しない場所になり 404 が出ていた。
 * 同じサイト（ホスト）内・待ち時間 10 秒以下・元と違う URL のときだけ返す。それ以外は ''。
 * @param {string} html
 * @param {string} baseUrl
 */
function metaRefreshTarget(html, baseUrl) {
  const head = String(html || '').slice(0, 20000);
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    if (!/http-equiv\s*=\s*["']?refresh/i.test(tag)) continue;
    const content = (tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i) || [])[1] || '';
    const m = content.match(/^\s*(\d+(?:\.\d+)?)\s*[;,]\s*url\s*=\s*['"]?([^'"\s]+)/i);
    if (!m || Number(m[1]) > 10) continue;
    try {
      const base = new URL(baseUrl);
      const target = new URL(m[2], base);
      target.hash = '';
      if (!/^https?:$/.test(target.protocol) || target.hostname !== base.hostname) return '';
      const from = new URL(base.href); from.hash = '';
      return target.href === from.href ? '' : target.href;
    } catch { return ''; }
  }
  return '';
}

// Recover HTML already received by the browser when scripts navigate during
// page.content(), or resources delay load. Never issue an extra HTTP request,
// except to follow a same-site <meta refresh> stub once (a browser does the same).
async function readOfficeSnapshot(page, url) {
  let response = null;
  page.on?.('response', candidate => {
    const req = candidate.request();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) response = candidate;
  });
  let navigationError = null;
  try { response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }) || response; }
  catch (error) { navigationError = error; }
  if (!response) throw navigationError || Error('No document response');
  let status = response.status();
  let html;
  try { html = await page.content(); }
  catch (error) {
    if (!response.body) throw error;
    html = decodeHtml(await response.body(), response.headers?.() || {});
  }
  let finalUrl = response.url?.() || page.url();

  // 転送用ページなら転送先を 1 回だけ開き、転送先の URL と中身を組で返す
  // （中身は転送先なのに URL が転送前のまま、という食い違いを作らない）
  const target = status >= 200 && status < 400 ? metaRefreshTarget(html, finalUrl) : '';
  if (target) {
    let next = null;
    try { next = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 }); }
    catch { next = null; }
    if (next) {
      status = next.status();
      try { html = await page.content(); }
      catch { html = next.body ? decodeHtml(await next.body(), next.headers?.() || {}) : html; }
      finalUrl = next.url?.() || target;
    }
  }
  return { html, status, finalUrl };
}
module.exports = { readOfficeSnapshot, decodeHtml, metaRefreshTarget };
