'use strict';
// 依存パッケージの脆弱性監査の判定（2026-10-28 導入）。
//
// `npm audit` は「修正版が無い／上げると壊れる」指摘があるだけで毎回失敗し、CI のゲートとして使えなかった
// （以前の pr-check.yml は satori の指摘で全 PR が赤になる状態だった）。かといって重大度で足切りすると
// 新しい指摘を見落とす。そこで「確認して受け入れた指摘」を security/audit-allowlist.json に
// 理由・対策・期限つきで書き、それ以外の指摘が1件でもあれば失敗にする。
//
//   - 一覧に無い指摘            … 失敗（新しい脆弱性。直すか、確認して一覧に足す）
//   - 一覧にあるが期限切れ      … 失敗（受け入れたまま放置しない。見直して期限を延ばすか直す）
//   - 一覧にあるが今は出ない    … 警告（直ったので一覧から消してよい）
//
// 入出力（npm の実行・ファイル読み書き）は scripts/audit-deps.mjs が行う。ここは純粋関数だけ。

const SEVERITY_ORDER = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };

/** advisory の URL から GHSA ID を取り出す（無ければ npm の source 番号） */
function advisoryId(via) {
  const m = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(String(via && via.url || ''));
  if (m) return `GHSA-${m[0].slice(5).toLowerCase()}`; // GitHub の表記（GHSA-xxxx-xxxx-xxxx）に揃える
  return via && via.source != null ? `npm-${via.source}` : 'unknown';
}

/**
 * `npm audit --json` の結果から、脆弱性の本体（advisory を直接持つパッケージ）だけを取り出す。
 * 依存をたどって巻き込まれただけのパッケージ（via が文字列）は数えない（同じ指摘の重複になるため）。
 * @returns {{project,package,id,severity,title,url,range,paths}[]}
 */
function collectFindings(auditJson, project) {
  const out = [];
  const seen = new Set();
  const vulns = (auditJson && auditJson.vulnerabilities) || {};
  for (const [name, v] of Object.entries(vulns)) {
    for (const via of v.via || []) {
      if (!via || typeof via !== 'object') continue;
      const pkg = via.name || name;
      const id = advisoryId(via);
      const key = `${project}|${pkg}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        project, package: pkg, id,
        severity: via.severity || v.severity || 'unknown',
        title: via.title || '', url: via.url || '', range: via.range || '',
        paths: v.nodes || [],
      });
    }
  }
  return out.sort((a, b) => (SEVERITY_ORDER[b.severity] ?? -1) - (SEVERITY_ORDER[a.severity] ?? -1)
    || a.package.localeCompare(b.package));
}

/** 一覧の項目がこの指摘に当たるか（ID・パッケージ・プロジェクトがすべて一致） */
function entryMatches(entry, f) {
  return String(entry.id || '').toUpperCase() === f.id.toUpperCase()
    && entry.package === f.package
    && (!Array.isArray(entry.projects) || entry.projects.includes(f.project));
}

/** 一覧の項目の形を検査する（書き漏れがあると「受け入れた理由」が残らないため） */
function validateAllowlist(allowlist) {
  const errors = [];
  const entries = (allowlist && allowlist.entries) || [];
  if (!Array.isArray(entries)) return ['entries が配列ではありません'];
  entries.forEach((e, i) => {
    const at = `entries[${i}]（${e && e.id || '?'} / ${e && e.package || '?'}）`;
    for (const k of ['id', 'package', 'reason', 'mitigation', 'expires', 'reviewedAt']) {
      if (!e || !e[k] || typeof e[k] !== 'string') errors.push(`${at}: ${k} がありません`);
    }
    if (e && e.expires && !/^\d{4}-\d{2}-\d{2}$/.test(e.expires)) errors.push(`${at}: expires は YYYY-MM-DD で書いてください`);
    if (e && e.projects && !Array.isArray(e.projects)) errors.push(`${at}: projects は配列で書いてください`);
  });
  return errors;
}

/**
 * 指摘と一覧を突き合わせる。
 * @param {object[]} findings collectFindings の結果（全プロジェクト分）
 * @param {{entries: object[]}} allowlist
 * @param {string} today YYYY-MM-DD（JST）
 * @returns {{ok:boolean, blocking:object[], expired:object[], accepted:object[], unused:object[], errors:string[]}}
 */
function evaluate(findings, allowlist, today) {
  const entries = (allowlist && allowlist.entries) || [];
  const errors = validateAllowlist(allowlist);
  const blocking = [];
  const expired = [];
  const accepted = [];
  const used = new Set();
  for (const f of findings) {
    const idx = entries.findIndex(e => entryMatches(e, f));
    if (idx < 0) { blocking.push(f); continue; }
    used.add(idx);
    const entry = entries[idx];
    if (String(entry.expires) < today) expired.push({ ...f, entry });
    else accepted.push({ ...f, entry });
  }
  const unused = entries.filter((_, i) => !used.has(i));
  return { ok: !blocking.length && !expired.length && !errors.length, blocking, expired, accepted, unused, errors };
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** GitHub Actions の実行サマリ用の Markdown */
function formatMarkdown(result, { today = '' } = {}) {
  const lines = [`## 依存パッケージの脆弱性監査${today ? `（${today}）` : ''}`, ''];
  lines.push(result.ok ? '✅ 未対応の指摘はありません。' : '❌ 対応が必要な指摘があります。', '');
  const table = (title, rows, withEntry) => {
    if (!rows.length) return;
    lines.push(`### ${title}（${rows.length}件）`, '');
    lines.push(withEntry ? '| 重大度 | 対象 | パッケージ | 指摘 | 期限 | 対策 |' : '| 重大度 | 対象 | パッケージ | 指摘 | 影響する版 |');
    lines.push(withEntry ? '|---|---|---|---|---|---|' : '|---|---|---|---|---|');
    for (const r of rows) {
      const link = r.url ? `[${r.id}](${r.url})` : r.id;
      lines.push(withEntry
        ? `| ${r.severity} | ${r.project} | ${cell(r.package)} | ${link} ${cell(r.title)} | ${r.entry.expires} | ${cell(r.entry.mitigation)} |`
        : `| ${r.severity} | ${r.project} | ${cell(r.package)} | ${link} ${cell(r.title)} | ${cell(r.range)} |`);
    }
    lines.push('');
  };
  table('未対応（一覧に無い新しい指摘）', result.blocking, false);
  table('受け入れ期限切れ（見直しが必要）', result.expired, true);
  table('確認済み・受け入れ中', result.accepted, true);
  if (result.unused.length) {
    lines.push(`### 一覧から消してよい項目（${result.unused.length}件。今は指摘されていません）`, '');
    for (const e of result.unused) lines.push(`- ${e.id} / ${e.package}`);
    lines.push('');
  }
  if (result.errors.length) {
    lines.push('### 受け入れ一覧の書き方の誤り', '');
    for (const e of result.errors) lines.push(`- ${e}`);
    lines.push('');
  }
  lines.push('受け入れ一覧: `security/audit-allowlist.json`／手順: `SECURITY.md` の「依存パッケージの脆弱性監査」');
  return lines.join('\n');
}

module.exports = { collectFindings, evaluate, validateAllowlist, formatMarkdown, advisoryId, SEVERITY_ORDER };
