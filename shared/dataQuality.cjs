// events.json のデータ品質検証（純粋）。CI（scripts/check-data-quality.mjs）から使う。
// errors = デプロイ停止、warnings = 通知のみ。
'use strict';

const { isRealDate } = require('./weather.cjs');
const { isJunkOrStubTitle, isSuspiciousTitle, isNonEventDocument, suspiciousFutureDate, isEligibleForStructuredEvent } = require('./titleQuality.cjs');
const reg = require('./eventRegression.cjs');
const { STATUS_VALUES } = require('./eventStatus.cjs');

// 内部 office ID の許容形式（小文字英数・ハイフン）。表示名や日本語は不可。
const OFFICE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// events.json の正規キー（北海道は4方面隊キー）。pref フィールドとキーの一致を検証する。
const PREF_KEYS = new Set([
  'sapporo', 'asahikawa', 'obihiro', 'hakodate',
  'miyagi', 'aomori', 'iwate', 'yamagata', 'fukushima', 'akita',
  'kanagawa', 'tokyo', 'saitama', 'gunma', 'tochigi', 'ibaraki', 'chiba',
  'niigata', 'toyama', 'ishikawa', 'fukui', 'yamanashi', 'nagano', 'gifu', 'shizuoka', 'aichi',
  'mie', 'shiga', 'kyoto', 'osaka', 'hyogo', 'nara', 'wakayama',
  'tokushima', 'kagawa', 'ehime', 'kochi',
  'tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi',
  'fukuoka', 'saga', 'nagasaki', 'kumamoto', 'oita', 'miyazaki', 'kagoshima', 'okinawa',
]);
const ACCURACY_OK = new Set(['address', 'venue', 'municipality', 'prefecture', 'manual']);
const JP = { latMin: 20, latMax: 46.5, lonMin: 122, lonMax: 154 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {object} data events.json（pref キー → 配列、updatedAt）
 * @param {object} [opts]
 *   prevTotal?:number        前回の総数（総数の急減検査）
 *   prevData?:object         前回の events.json 全体（地本件数・項目の回帰・消失の検査）
 *   today?:string            YYYY-MM-DD（未終了の判定・未来日の検査。省略時は JST 今日）
 *   quarantineIds?:Set       今回検疫されたイベントID（消失理由の分類）
 *   manualIds?:Set<string>
 *   dropRatio?:number        指定時は従来どおり「総数がこの比率未満でエラー」（後方互換）
 * @returns {{errors:string[], warnings:string[], total:number, byAccuracy:object, regression:object|null}}
 */
function validateEventsData(data, opts = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Map(); // id → "pref/title" 最初の出現
  let total = 0;
  let structuredIneligible = 0;
  const today = opts.today || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const byAccuracy = { address: 0, venue: 0, municipality: 0, prefecture: 0, manual: 0, missing: 0 };

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { errors: ['events.json の構造が不正です（オブジェクトではありません）'], warnings, total: 0, byAccuracy };
  }

  for (const key of Object.keys(data)) {
    if (key === 'updatedAt') continue;
    const arr = data[key];
    if (!Array.isArray(arr)) {
      errors.push(`[${key}] 値が配列ではありません（構造破損）`);
      continue;
    }
    if (!PREF_KEYS.has(key)) {
      errors.push(`[${key}] 不明な地本キーです`);
      continue;
    }
    arr.forEach((ev, i) => {
      const loc = `[${key}#${i}]`;
      if (!ev || typeof ev !== 'object') { errors.push(`${loc} イベントがオブジェクトではありません`); return; }
      total++;

      // 必須: id
      if (!ev.id || typeof ev.id !== 'string') {
        errors.push(`${loc} id がありません`);
      } else {
        if (ids.has(ev.id)) errors.push(`${loc} id 重複: "${ev.id}"（既出: ${ids.get(ev.id)}）`);
        else ids.set(ev.id, `${key}/${(ev.title || '').slice(0, 12)}`);
        // 手動イベントとのID衝突（events.json に manual- が混入していないか）
        if (/^manual-/.test(ev.id)) errors.push(`${loc} スクレイプデータに手動イベントID が混入: "${ev.id}"`);
        if (opts.manualIds && opts.manualIds.has(ev.id)) errors.push(`${loc} 手動イベントとID衝突: "${ev.id}"`);
      }

      // 必須: pref とキー一致
      if (ev.pref !== key) errors.push(`${loc} pref(${ev.pref}) が格納キー(${key})と不一致`);

      // 必須: 日付
      if (!ev.date || !DATE_RE.test(ev.date)) errors.push(`${loc} date の形式が不正: "${ev.date}"`);
      else if (!isRealDate(ev.date)) errors.push(`${loc} 実在しない日付: "${ev.date}"`);
      if (ev.endDate) {
        if (!DATE_RE.test(ev.endDate) || !isRealDate(ev.endDate)) errors.push(`${loc} endDate が不正: "${ev.endDate}"`);
        else if (ev.endDate < ev.date) errors.push(`${loc} endDate(${ev.endDate}) < date(${ev.date})`);
      }

      // 必須: タイトル
      const title = typeof ev.title === 'string' ? ev.title.trim() : '';
      if (!title) errors.push(`${loc} タイトルが空です`);
      else {
        // OCR断片・住所/電話のみ・様式文章など（警告）
        if (isJunkOrStubTitle(title)) warnings.push(`${loc} 疑わしいタイトル（OCR断片/住所/様式の可能性）: "${title.slice(0, 30)}"`);
        if (title.length > 80) warnings.push(`${loc} タイトルが極端に長い（${title.length}字）`);
      }

      // 非イベント文書・不自然な未来日・構造化データ対象外（警告。公開前の除外は writeOutput が行う）
      if (title && isNonEventDocument(ev)) warnings.push(`${loc} 非イベント文書の疑い: "${title.slice(0, 30)}"`);
      const future = suspiciousFutureDate(ev, today);
      if (future) warnings.push(`${loc} OCR由来の不自然な未来日(${future === 'strong' ? '2年以上先' : '1年以上先'}): ${ev.date} "${title.slice(0, 30)}"`);
      if (title && !isEligibleForStructuredEvent(ev, today)) structuredIneligible++;

      // URL 形式（警告）
      if (ev.url && !/^https?:\/\//i.test(String(ev.url))) warnings.push(`${loc} URL 形式が不正: "${ev.url}"`);

      // 会場情報（警告）
      if (!ev.place || !String(ev.place).trim()) warnings.push(`${loc} 会場情報(place)がありません`);

      // 「公式確認」スタブ（office_notice）の混入（2026-07-02 生成廃止。偽の開催日を持つ疑似イベント）
      if (ev.source_type === 'office_notice') {
        warnings.push(`${loc} 廃止済みの office_notice スタブが混入: "${(ev.title || '').slice(0, 30)}"`);
      }

      // 文字列 "null"/"undefined"（OCR/LLM が JSON null を文字列で返したもの）
      for (const f of ['place', 'time', 'deadline', 'address', 'ageRequirement', 'notes']) {
        if (typeof ev[f] === 'string' && /^(null|undefined)$/i.test(ev[f].trim())) {
          warnings.push(`${loc} ${f} が文字列 "${ev[f]}" になっています（空にすべき）`);
        }
      }
      // time の書式（正準は HH:MM～HH:MM／HH:MM／終日。複数部制・複数日は許容）
      if (ev.time && /時|分|から|午前|午後/.test(String(ev.time))) {
        warnings.push(`${loc} time が未整形（時分表記）: "${String(ev.time).slice(0, 30)}"`);
      }
      // place に住所/郵便番号が混入
      if (ev.place && /〒\s*\d|,\s*日本[、,]/.test(String(ev.place))) {
        warnings.push(`${loc} place に住所/郵便番号が混入: "${String(ev.place).slice(0, 30)}"`);
      }

      // status（受付終了/中止）— 許可値・根拠・整合
      if (ev.status != null && ev.status !== '') {
        if (!STATUS_VALUES.has(ev.status)) {
          errors.push(`${loc} status が不正: "${ev.status}"（許可: published/closed/cancelled/draft）`);
        }
        if (ev.status === 'cancelled' && !(ev.statusReason && String(ev.statusReason).trim())) {
          warnings.push(`${loc} cancelled なのに statusReason が空です`);
        }
        if (ev.status === 'closed' && !(ev.statusReason && String(ev.statusReason).trim())) {
          warnings.push(`${loc} closed なのに statusReason（根拠）が空です`);
        }
        if (ev.statusSource === 'ocr') {
          warnings.push(`${loc} OCR由来の状態(${ev.status})です。一次ソース照合を推奨`);
        }
      }

      // deadlineDate（機械判定用の締切日）— ISO 実在日・開催日との整合
      if (ev.deadlineDate != null && ev.deadlineDate !== '') {
        if (!DATE_RE.test(String(ev.deadlineDate)) || !isRealDate(String(ev.deadlineDate))) {
          errors.push(`${loc} deadlineDate が不正（ISO実在日ではない）: "${ev.deadlineDate}"`);
        } else {
          const eff = (ev.endDate && isRealDate(ev.endDate)) ? ev.endDate : ev.date;
          // 締切が開催（終了）日より後は不自然（警告）
          if (isRealDate(eff) && ev.deadlineDate > eff) {
            warnings.push(`${loc} deadlineDate(${ev.deadlineDate}) が開催日(${eff})より後です`);
          }
        }
      }

      // office（内部ID）— 形式検証（表示名・日本語混入を防ぐ）
      if (ev.office != null && ev.office !== '' && !OFFICE_ID_RE.test(String(ev.office))) {
        errors.push(`${loc} office が内部ID形式ではありません: "${ev.office}"`);
      }

      // weatherLocation（座標範囲・accuracy）
      const wl = ev.weatherLocation;
      if (wl) {
        const { latitude: la, longitude: lo, accuracy } = wl;
        if (typeof la !== 'number' || typeof lo !== 'number' ||
            la < JP.latMin || la > JP.latMax || lo < JP.lonMin || lo > JP.lonMax) {
          errors.push(`${loc} weatherLocation の座標が範囲外: (${la}, ${lo})`);
        }
        if (accuracy && !ACCURACY_OK.has(accuracy)) errors.push(`${loc} weatherLocation.accuracy が不正: "${accuracy}"`);
        if (accuracy === 'prefecture') byAccuracy.prefecture++;
        else if (accuracy && byAccuracy[accuracy] != null) byAccuracy[accuracy]++;
      }
    });
  }

  // 総数の異常減少（前回比）。季節変動があるため補助判定（主判定は地本単位・項目単位）。
  if (typeof opts.prevTotal === 'number' && opts.prevTotal > 0) {
    if (opts.dropRatio) {
      if (total < opts.prevTotal * opts.dropRatio) errors.push(`イベント総数が異常に減少: 前回 ${opts.prevTotal} → 今回 ${total}`);
    } else {
      const d = reg.analyzeTotalDrop(opts.prevTotal, total);
      const pct = Math.round((d ? d.drop : 0) * 100);
      if (d && d.level === 'error') errors.push(`イベント総数が異常に減少（前回比 ${pct}% 減）: 前回 ${opts.prevTotal} → 今回 ${total}`);
      else if (d) warnings.push(`イベント総数が前回比 ${pct}% 減少: 前回 ${opts.prevTotal} → 今回 ${total}`);
    }
  }
  if (structuredIneligible) warnings.push(`構造化データ(JSON-LD)の対象外: ${structuredIneligible} 件（品質基準により Event として出力しない）`);

  const regression = opts.prevData ? checkRegressions(opts.prevData, data, { today, quarantineIds: opts.quarantineIds }, errors, warnings) : null;
  return { errors, warnings, total, byAccuracy, regression };
}

/** 前回との比較で「現行の品質基準なら公開される」イベントか（品質ルール追加による正当な減少を除く）。 */
function isCountableEvent(ev) {
  return !!(ev && ev.title && !isJunkOrStubTitle(ev.title) && !isSuspiciousTitle(ev.title) && !isNonEventDocument(ev)
    && ev.source_type !== 'office_notice');
}

const shortVal = (v) => (v == null ? 'null' : JSON.stringify(v));

/**
 * 前回データとの差分検査（地本件数・重要項目・イベント消失）。errors/warnings に追記し、集計を返す。
 * ログは「どの地本の・どのイベントの・どの項目が・何から何へ」を1行で分かる形にする。
 */
function checkRegressions(prevData, data, { today, quarantineIds = new Set() } = {}, errors = [], warnings = []) {
  const isCountable = isCountableEvent;
  const prefAlerts = reg.analyzePrefCountRegressions(prevData, data, { today, isCountable });
  for (const a of prefAlerts) {
    const msg = `[${a.pref}] 未終了イベントが ${a.previous} → ${a.current}（${a.rule}）`;
    (a.level === 'error' ? errors : warnings).push(msg);
  }
  const ev = reg.analyzeEventRegressions(prevData, data, { today });
  for (const r of ev.fields) {
    const msg = `[${r.pref}:${r.id}] ${r.field} が消失: ${r.previous == null ? 'null' : JSON.stringify(r.previous)} -> ${shortVal(r.current)}（${r.title ? r.title.slice(0, 24) : ''}）`;
    // 保護すべき消失（抽出失敗）はエラー。中止・明示削除・会場変更による消失は正当な変更として警告に留める
    if (r.protectable) errors.push(msg); else warnings.push(`${msg} [${r.reason}]`);
  }
  for (const n of ev.notes) {
    const why = [n.lostKeywords.length ? `重要語の消失: ${n.lostKeywords.join('・')}` : '', n.shrunk ? `${n.previousLength}→${n.currentLength}字` : ''].filter(Boolean).join(' / ');
    warnings.push(`[${n.pref}:${n.id}] notes が大きく変化（${why}）`);
  }
  const missing = reg.analyzeMissingEvents(prevData, data, { today, quarantineIds, isCountable });
  for (const m of missing.filter(x => x.reason === 'unexplained')) {
    warnings.push(`[${m.pref}:${m.id}] 未終了イベントが消失: ${m.date} "${String(m.title || '').slice(0, 30)}"（${m.source_type || '-'}）`);
  }
  const missingByPref = reg.summarizeMissingByPref(missing, prevData, { today, isCountable });
  for (const s of missingByPref.filter(x => x.level === 'error')) {
    errors.push(`[${s.pref}] 原因不明の未終了イベント消失が ${s.missing} 件（前回 ${s.previous} 件中）`);
  }
  return {
    prefAlerts,
    fieldRegressions: ev.fields,
    notesChanges: ev.notes,
    missingEvents: missing,
    summary: {
      prefErrors: prefAlerts.filter(a => a.level === 'error').length,
      prefWarnings: prefAlerts.filter(a => a.level === 'warning').length,
      fieldErrors: ev.fields.filter(r => r.protectable).length,
      fieldWarnings: ev.fields.filter(r => !r.protectable).length,
      missingUnexplained: missing.filter(m => m.reason === 'unexplained').length,
      missingTotal: missing.length,
    },
  };
}

/**
 * 全県横断でイベントIDの重複（ハッシュ衝突）を一意化する（データを変更）。
 * 2件目以降の衝突IDに連番接尾辞（-2, -3…）を付ける。フロントの実行時一意化と整合。
 * @returns 変更件数
 */
function uniquifyIds(data) {
  if (!data || typeof data !== 'object') return 0;
  const seen = new Set();
  let changed = 0;
  for (const key of Object.keys(data)) {
    if (!Array.isArray(data[key])) continue;
    for (const ev of data[key]) {
      if (!ev || !ev.id) continue;
      if (!seen.has(ev.id)) { seen.add(ev.id); continue; }
      let n = 2, uid;
      do { uid = `${ev.id}-${n++}`; } while (seen.has(uid));
      ev.id = uid; seen.add(uid); changed++;
    }
  }
  return changed;
}

module.exports = { validateEventsData, checkRegressions, isCountableEvent, uniquifyIds, PREF_KEYS, ACCURACY_OK };
