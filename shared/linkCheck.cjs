'use strict';
/**
 * 公式リンク（イベントの url）のリンク切れ検査の判定（2026-11-23 導入）。
 * 取得は scripts/check-links.mjs（週1回・1件ずつ間隔を空ける・robots.txt に従う・正直な UA）。
 *
 * 判定の考え方（誤って「リンク切れ」と言わない）:
 *   broken  … 404 / 410（ページが無い）
 *   ok      … 2xx / 3xx
 *   unknown … 403・429・5xx・ボット確認画面・通信失敗・robots.txt で不許可（確かめられなかった）
 * 「unknown」はリンク切れとして扱わない（防衛省サイトはボット確認で 403 を返すことが多い）。
 */

/**
 * 公開インターネット上の http(s) URL か（リンク検査で内部ネットワークへ接続しないため）。
 * IP アドレス直書き・localhost・.local/.internal/.localhost・80/443 以外のポートは不可。
 * 取得するのはスクレイプした値なので、万一おかしな URL が混ざっても内部へは行かない。
 */
function isPublicHttpUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h || !h.includes('.')) return false;
  if (/^\[|^[\d.]+$|:/.test(h)) return false; // IPv4・IPv6 の直書き
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(h)) return false;
  return true;
}

/** HTTP の結果を分類する */
function classifyLink({ status, error, challenge, disallowed } = {}) {
  if (disallowed) return 'unknown';
  if (error) return 'unknown';
  if (challenge) return 'unknown';
  if (status === 404 || status === 410) return 'broken';
  if (status >= 200 && status < 400) return 'ok';
  return 'unknown';
}

/** ボット確認画面（Cloudflare 等）か */
function isChallengePage(status, bodyStart = '') {
  return (status === 403 || status === 503 || status === 429)
    && /Just a moment|cf-chl|challenges\.cloudflare\.com|Attention Required/i.test(String(bodyStart));
}

/**
 * robots.txt を読んで、指定 UA が path を取得してよいか判定する関数を返す（RFC 9309 の簡易版）。
 * 一致するグループ（UA 名を含む）が無ければ * のグループ。Allow と Disallow は最長一致、同長なら Allow。
 */
function parseRobots(text, userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (cur && (key === 'allow' || key === 'disallow')) {
      cur.rules.push({ allow: key === 'allow', path: val });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  const named = groups.filter(g => g.agents.some(a => a !== '*' && ua.includes(a)));
  const chosen = named.length ? named : groups.filter(g => g.agents.includes('*'));
  const rules = chosen.flatMap(g => g.rules).filter(r => r.path !== '');
  return (path) => {
    let best = null;
    for (const r of rules) {
      const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const re = new RegExp('^' + (pat.endsWith('\\$') ? pat.slice(0, -2) + '$' : pat));
      if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    }
    return !best || best.allow;
  };
}

/** robots.txt の取得結果からの方針（RFC 9309: 4xx＝制限なし、5xx・通信失敗＝全て不許可） */
function robotsPolicyFromStatus(status) {
  if (status >= 200 && status < 300) return 'parse';
  if (status >= 400 && status < 500) return 'allow_all';
  return 'disallow_all';
}

module.exports = { isPublicHttpUrl, classifyLink, isChallengePage, parseRobots, robotsPolicyFromStatus };
