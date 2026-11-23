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

/**
 * 接続先の IP アドレスが内部向け（接続してはいけない）か。
 * ホスト名の文字列だけでは、普通のドメイン名が内部アドレスに名前解決される場合を防げない
 * （2026-11-23 指摘）。スクリプトは実際に接続するアドレスをこれで検査する（名前解決の結果そのものを使う）。
 *   IPv4: 0/8・10/8・100.64/10（CGNAT）・127/8・169.254/16・172.16/12・192.0.0/24・192.168/16・198.18/15・224/4 以上
 *   IPv6: ::・::1・fc00::/7・fe80::/10・ff00::/8・IPv4 埋め込み（::ffff:a.b.c.d 等）は中の IPv4 で判定
 * 形式が分からない値も「内部」として扱う（安全側）。
 */
function isPrivateAddress(ip) {
  const s = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v4 = (a) => {
    const p = a.split('.').map(Number);
    if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [x, y] = p;
    return x === 0 || x === 10 || x === 127 || (x === 100 && y >= 64 && y <= 127) || (x === 169 && y === 254)
      || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 0 && p[2] === 0) || (x === 192 && y === 168)
      || (x === 198 && (y === 18 || y === 19)) || x >= 224;
  };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return v4(s);
  if (!s.includes(':')) return true;
  const embedded = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) return v4(embedded[1]);
  // IPv4 埋め込みの16進表記（::ffff:7f00:1 ＝ 127.0.0.1、64:ff9b::a00:1 ＝ 10.0.0.1）
  const hexMapped = s.match(/^(?:::ffff:|::ffff:0:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
    return v4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (s === '::' || s === '::1') return true;
  // 先頭の16ビット
  const head = s.startsWith('::') ? 0 : parseInt(s.split(':')[0] || '0', 16);
  if (!Number.isFinite(head)) return true;
  if ((head & 0xfe00) === 0xfc00) return true;   // fc00::/7
  if ((head & 0xffc0) === 0xfe80) return true;   // fe80::/10
  if ((head & 0xff00) === 0xff00) return true;   // ff00::/8
  return false;
}

/**
 * 名前解決（dns.lookup と同じ呼び出し形）を包み、内部アドレスが1つでも含まれたら失敗させる関数を作る。
 * http/https の lookup オプションに渡すと、検査したアドレスにだけ接続する（検査後の差し替えが起きない）。
 * @param {Function} lookupFn dns.lookup（テストでは偽物を渡す）
 * @param {boolean} allowLocal テスト用。true なら検査しない
 */
function makeSafeLookup(lookupFn, allowLocal = false) {
  return function safeLookup(hostname, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    lookupFn(hostname, { ...(options || {}), all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [];
      if (!list.length) return cb(Object.assign(new Error('no-address'), { code: 'ENOTFOUND' }));
      if (!allowLocal && list.some(a => isPrivateAddress(a && a.address))) {
        return cb(Object.assign(new Error('blocked-private-address'), { code: 'EBLOCKED' }));
      }
      if (options && options.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };
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

module.exports = { makeSafeLookup, isPrivateAddress, isPublicHttpUrl, classifyLink, isChallengePage, parseRobots, robotsPolicyFromStatus };
