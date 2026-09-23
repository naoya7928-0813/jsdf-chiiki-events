// イベントデータの「非退行」（前回値との比較・情報劣化の検出と保護）— 純粋ロジック。
//
// 原則: absence is not deletion（取れなかった ≠ 公式が消した）。
//   同一イベントで前回取得済みの重要情報を、次回の抽出失敗だけを理由に空値で上書きしない。
//   地本の未終了イベントが突然0件になったら、正常と確認できない限りそのまま公開しない。
//
// 使う側:
//   - scraper/index.js writeOutput() … 公開前の前回値保護（mergeNonRegressiveEvent / carryOverVanishedPrefs）
//   - scripts/check-data-quality.mjs … CI での差分検査（analyze*）
// 2026-09-23 事故（山梨3→0件・東京 time 消失・埼玉 締切/年齢条件消失）の再発防止。
// 実行状態（取得失敗・時間切れ）による地本単位の引き継ぎは shared/scrapeDeadline.cjs の責務で、
// ここは「取得結果そのものの異常（減少・項目の劣化）」だけを扱う。
'use strict';

const { normForDedup } = require('./titleQuality.cjs');
const { detectCancelled } = require('./eventStatus.cjs');

// 前回値を保護する項目（status は eventStatus.mergeStatus、firstSeen は writeOutput が別に扱う）
const PROTECTED_FIELDS = ['time', 'place', 'address', 'notes', 'ageRequirement', 'deadline', 'deadlineDate', 'weatherLocation'];
// CI で「消失したらエラー」とする項目。notes は本文の更新で正当に短くなるため警告のみ（別扱い）
const CRITICAL_FIELDS = ['time', 'place', 'address', 'ageRequirement', 'deadline', 'deadlineDate', 'weatherLocation'];

// 備考から消えたら警告する重要語（申込条件・参加条件に関わるもの）
const NOTES_KEYWORDS = ['抽選', '予約', '要申込', '事前申込', '日本国籍', '保護者', '定員', '締切', '無料', '持ち物', '受付'];

// 「公式が明示的にその項目を無くした」と読める文言。これが今回の本文にあれば前回値を戻さない。
const EXPLICIT_REMOVAL = {
  time:           /時間未定|時間は未定|時間調整中|時刻未定/,
  place:          /会場未定|場所未定|会場調整中|場所調整中/,
  deadline:       /締切なし|締め切りなし|締切りなし|応募不要|申込不要|申し込み不要|予約不要|申込み不要/,
  deadlineDate:   /締切なし|締め切りなし|締切りなし|応募不要|申込不要|申し込み不要|予約不要|申込み不要/,
  ageRequirement: /年齢不問|年齢制限なし|年齢制限はありません|どなたでも|対象制限なし/,
};

// 地本単位の件数回帰の閾値（未終了イベント数で比較）。
//   ZERO_MIN_PREV   … 前回この件数以上あって今回0件ならエラー（山梨 3→0 の事故）。
//                     1件→0件は自然な終了・掲載取り下げと区別できないため対象外。
//   SHARP_*         … 前回5件以上で4割未満に減ったらエラー（地本の大半が一度に消えるのは取得異常の典型）
//   WARN_*          … 前回3件以上で7割未満に減ったら警告（掲載入れ替えでも起こり得る範囲）
const PREF_THRESHOLDS = Object.freeze({
  ZERO_MIN_PREV: 2,
  SHARP_MIN_PREV: 5, SHARP_RATIO: 0.4,
  WARN_MIN_PREV: 3, WARN_RATIO: 0.7,
});

// 全国総数の閾値（季節変動があるため主判定には使わない。補助）
const TOTAL_THRESHOLDS = Object.freeze({ WARN_DROP: 0.20, ERROR_DROP: 0.35 });

// 同一 id のイベントが消えたときにエラーとする件数（1地本あたり）。
// 公式の掲載取り下げは1〜2件単位で日常的に起きるため、1件ずつはエラーにせず、
// 同じ地本でまとまって消えた（＝取得経路ごと落ちた）場合をエラーにする。
const MISSING_ERROR_MIN = 3;
const MISSING_ERROR_RATIO = 0.3;

/** 空値か（null/undefined/空文字/空白のみ/"null"/"undefined"）。0・"0"・false は空ではない。 */
function isBlankValue(v) {
  if (v == null) return true;
  if (typeof v === 'string') {
    const s = v.trim();
    return !s || /^(null|undefined)$/i.test(s);
  }
  return false;
}

/** 天気用座標として有効か。 */
function isValidLocation(wl) {
  return !!wl && typeof wl === 'object'
    && Number.isFinite(wl.latitude) && Number.isFinite(wl.longitude);
}

/** 項目の値が「無い」か（weatherLocation は座標の有無で判定）。 */
function isMissingField(ev, field) {
  if (field === 'weatherLocation') return !isValidLocation(ev && ev.weatherLocation);
  return isBlankValue(ev ? ev[field] : null);
}

/** URL の比較用正規化（スキーム・大小文字・末尾スラッシュ・index.html・#以降の差を吸収）。 */
function canonicalUrl(u) {
  const s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    const x = new URL(s);
    let p = x.pathname.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '');
    return `${x.hostname.toLowerCase()}${p}${x.search}`;
  } catch { return ''; }
}

/** events.json → Map(id → イベント)。O(n)。 */
function buildEventIndex(data) {
  const m = new Map();
  if (!data || typeof data !== 'object') return m;
  for (const k of Object.keys(data)) {
    if (!Array.isArray(data[k])) continue;
    for (const ev of data[k]) if (ev && ev.id && !m.has(ev.id)) m.set(ev.id, ev);
  }
  return m;
}

const effectiveEnd = (ev) => String((ev && (ev.endDate || ev.date)) || '');
/** 開催が終わっているか（today より前に終了）。 */
function isEnded(ev, today) { return !!today && effectiveEnd(ev) !== '' && effectiveEnd(ev) < today; }

/** 中止か（前回・今回いずれかの status か、今回の本文の中止告知）。 */
function isCancelledEvent(ev) {
  if (!ev) return false;
  if (ev.status === 'cancelled') return true;
  const text = [ev.title, ev.notes, ev.place].filter(Boolean).join('\n');
  try { return !!detectCancelled(text).cancelled; } catch { return false; }
}

/** 同じ公式ソースを指しているか（URL 正規化一致。どちらかが空なら false）。 */
function sameSource(prev, next) {
  const a = canonicalUrl(prev && prev.url), b = canonicalUrl(next && next.url);
  return !!a && a === b;
}

/**
 * 値を引き継いでよい「同一イベント」か（厳格）。
 * id・pref・開催日が一致し、かつ「同じ公式ソース」か「正規化タイトル一致」のどちらかを満たす。
 * 別イベントへの値の継承を避けるため、ここは緩めない。
 */
function sameEventIdentity(prev, next) {
  if (!prev || !next || !prev.id || prev.id !== next.id) return false;
  if (prev.pref !== next.pref || prev.date !== next.date) return false;
  if (sameSource(prev, next)) return true;
  const ta = normForDedup(prev.title || ''), tb = normForDedup(next.title || '');
  return !!ta && ta === tb;
}

/** 今回の本文（タイトル・備考・時間・会場）に、その項目を公式が無くしたと読める文言があるか。 */
function isExplicitlyRemoved(next, field) {
  if (next && next.__fieldState && next.__fieldState[field] === 'removed') return true;
  const re = EXPLICIT_REMOVAL[field];
  if (!re) return false;
  const text = [next.title, next.notes, next.time, next.place, next.deadline, next.ageRequirement].filter(Boolean).join('\n');
  return re.test(text);
}

const normPlace = (s) => String(s || '').replace(/[\s　]/g, '');

/** 会場・住所が実質同じか（座標の引き継ぎ可否）。 */
function samePlace(prev, next) {
  return normPlace(prev.place) === normPlace(next.place) && normPlace(prev.address) === normPlace(next.address);
}

/**
 * OCR の文字落ちによる劣化か（「横須賀基地」→「横賀基地」）。
 * 今回値が前回値の部分列で、途中の1〜2文字だけが欠けている場合のみ true。
 * 先頭・末尾の欠け（「横須賀基地」→「横須賀」）は正当な表記変更の可能性があるので対象外。
 */
function isDegradedVariant(prevStr, curStr) {
  const a = normPlace(prevStr), b = normPlace(curStr);
  if (!a || !b || a === b || a.length < 4) return false;
  const diff = a.length - b.length;
  if (diff < 1 || diff > 2) return false;
  if (a.startsWith(b) || a.endsWith(b)) return false;
  let i = 0;
  for (const ch of a) { if (i < b.length && ch === b[i]) i++; }
  return i === b.length && a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

/** 備考の重要語のうち、前回あって今回すべて消えたもの。 */
function lostNotesKeywords(prevNotes, curNotes) {
  const had = NOTES_KEYWORDS.filter(k => String(prevNotes || '').includes(k));
  if (!had.length) return [];
  const cur = String(curNotes || '');
  return had.every(k => !cur.includes(k)) ? had : [];
}

const clone = (v) => (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
const brief = (v) => {
  if (v == null) return null;
  if (typeof v === 'object') return isValidLocation(v) ? `(${v.latitude}, ${v.longitude}) ${v.accuracy || ''}`.trim() : '[object]';
  return String(v).slice(0, 120);
};

/**
 * 前回値を保護して今回のイベントを返す（next は変更しない）。
 * @returns {{ event:object, carried:Array<{field,previous,current,action}>, skipped?:string }}
 */
function mergeNonRegressiveEvent(prev, next, { today } = {}) {
  const none = (skipped) => ({ event: next, carried: [], ...(skipped ? { skipped } : {}) });
  if (!prev || !next) return none();
  if (!sameEventIdentity(prev, next)) return none('identity_mismatch');
  if (isEnded(next, today)) return none('ended');
  // 中止になったイベントに古い公開値を戻さない
  if (isCancelledEvent(next)) return none('cancelled');

  const out = { ...next };
  const carried = [];
  const carry = (field, action = 'carried_over') => {
    carried.push({ field, previous: brief(prev[field]), current: brief(next[field]), action });
    out[field] = clone(prev[field]);
  };

  for (const f of ['time', 'place', 'address', 'ageRequirement']) {
    if (!isBlankValue(prev[f]) && isBlankValue(next[f]) && !isExplicitlyRemoved(next, f)) carry(f);
  }
  // OCR の文字落ち（今回値はあるが前回値の劣化版）
  if (!isBlankValue(prev.place) && !isBlankValue(next.place) && isDegradedVariant(prev.place, next.place)) {
    carry('place', 'restored_degraded');
  }
  // notes は今回が完全に空のときだけ戻す（部分更新は公式の変更として尊重し、結合しない）
  if (!isBlankValue(prev.notes) && isBlankValue(next.notes)) carry('notes');
  // 締切は表示文字列(deadline)と機械判定用(deadlineDate)を組で扱う
  if (!isBlankValue(prev.deadline) && isBlankValue(next.deadline) && !isExplicitlyRemoved(next, 'deadline')) {
    carry('deadline');
    if (!isBlankValue(prev.deadlineDate) && isBlankValue(next.deadlineDate)) carry('deadlineDate');
  }
  // 座標は会場・住所が実質同じときだけ（会場が変わったら古い座標を使わない）
  if (isValidLocation(prev.weatherLocation) && !isValidLocation(next.weatherLocation) && samePlace(prev, out)) {
    carry('weatherLocation');
  }
  return { event: out, carried };
}

/** events.json の地本ごとの「未終了・中止以外」のイベント（isCountable で品質条件を追加できる）。 */
function futureEventsByPref(data, today, isCountable) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const k of Object.keys(data)) {
    if (!Array.isArray(data[k])) continue;
    out[k] = data[k].filter(ev => ev && ev.id && !isEnded(ev, today) && ev.status !== 'cancelled'
      && (!isCountable || isCountable(ev)));
  }
  return out;
}

/**
 * 地本単位の件数回帰。比較は「今日以降の未終了イベント」に限る（開催が終わって
 * 自然に消えた分は数えない）。isCountable で前回側を現行の品質基準に揃える
 * （品質ルールの追加で正当に除外された分を「急減」と誤検知しないため）。
 * @returns {Array<{pref, previous, current, level:'error'|'warning', rule}>}
 */
function analyzePrefCountRegressions(prevData, nextData, { today, isCountable } = {}) {
  const prev = futureEventsByPref(prevData, today, isCountable);
  const next = futureEventsByPref(nextData, today);
  const T = PREF_THRESHOLDS;
  const alerts = [];
  for (const pref of Object.keys(prev)) {
    const p = prev[pref].length, c = (next[pref] || []).length;
    if (p >= T.ZERO_MIN_PREV && c === 0) alerts.push({ pref, previous: p, current: c, level: 'error', rule: 'pref_zero' });
    else if (p >= T.SHARP_MIN_PREV && c < p * T.SHARP_RATIO) alerts.push({ pref, previous: p, current: c, level: 'error', rule: 'pref_sharp_drop' });
    else if (p >= T.WARN_MIN_PREV && c < p * T.WARN_RATIO) alerts.push({ pref, previous: p, current: c, level: 'warning', rule: 'pref_drop' });
  }
  return alerts;
}

/**
 * 地本の未終了イベントが0件になった地本について、前回の未終了イベントを引き継ぐ（公開前の救済）。
 * 条件は analyzePrefCountRegressions の pref_zero と同じ。
 * @returns {{ carried: Object<pref, events[]>, alerts: Array }}
 */
function carryOverVanishedPrefs(prevData, nextData, { today, isCountable } = {}) {
  const prev = futureEventsByPref(prevData, today, isCountable);
  const next = futureEventsByPref(nextData, today);
  const carried = {};
  const alerts = [];
  for (const pref of Object.keys(prev)) {
    const p = prev[pref];
    if (p.length >= PREF_THRESHOLDS.ZERO_MIN_PREV && (next[pref] || []).length === 0) {
      carried[pref] = p.map(clone);
      alerts.push({ pref, previous: p.length, current: 0, level: 'error', rule: 'pref_zero', action: 'carried_over' });
    }
  }
  return { carried, alerts };
}

/**
 * 同一 id の重要項目の回帰（前回有効 → 今回空）。
 * protectable=true は mergeNonRegressiveEvent が保護すべきだったもの（＝公開データに残っていれば不具合）。
 * @returns {{ fields: Array, notes: Array }}
 */
function analyzeEventRegressions(prevData, nextData, { today, fields = CRITICAL_FIELDS } = {}) {
  const prevIdx = buildEventIndex(prevData);
  const nextIdx = buildEventIndex(nextData);
  const out = { fields: [], notes: [] };
  for (const [id, p] of prevIdx) {
    const n = nextIdx.get(id);
    if (!n || isEnded(p, today) || isEnded(n, today)) continue;
    const identity = sameEventIdentity(p, n);
    const cancelled = isCancelledEvent(n);
    for (const f of fields) {
      if (isMissingField(p, f) || !isMissingField(n, f)) continue;
      const explicit = isExplicitlyRemoved(n, f);
      const placeChanged = f === 'weatherLocation' && !samePlace(p, n);
      // deadlineDate は deadline と組。締切の文言が書き換わって日付化できなくなった場合は正当な変更
      // （mergeNonRegressiveEvent も deadline が空のときだけ組で戻す。判定を一致させる）
      const deadlineChanged = f === 'deadlineDate' && !isBlankValue(n.deadline);
      out.fields.push({
        id, pref: n.pref, date: n.date, title: n.title, field: f,
        previous: brief(p[f]), current: brief(n[f]),
        protectable: identity && !cancelled && !explicit && !placeChanged && !deadlineChanged,
        reason: !identity ? 'identity_mismatch' : cancelled ? 'cancelled' : explicit ? 'explicit_removal'
          : placeChanged ? 'place_changed' : deadlineChanged ? 'deadline_changed' : 'extraction_failure',
      });
    }
    // 備考: 大幅短縮・重要語の消失は警告（自動結合はしない）
    if (!isBlankValue(p.notes) && !isBlankValue(n.notes)) {
      const lost = lostNotesKeywords(p.notes, n.notes);
      const shrunk = String(n.notes).length <= String(p.notes).length * 0.3;
      if (lost.length || shrunk) {
        out.notes.push({ id, pref: n.pref, date: n.date, title: n.title, lostKeywords: lost, shrunk,
          previousLength: String(p.notes).length, currentLength: String(n.notes).length });
      }
    }
  }
  return out;
}

/**
 * 前回あった未終了イベントが今回見つからないもの。理由を分類する。
 *   quarantined … 今回検疫された
 *   merged      … 同じ地本・日付・正規化タイトルのイベントが別 id で存在（統合・id 変更）
 *   filtered    … 現行の品質基準で除外対象（isCountable=false）
 *   unexplained … 原因不明（取得経路ごと落ちた可能性）
 */
function analyzeMissingEvents(prevData, nextData, { today, quarantineIds = new Set(), isCountable } = {}) {
  const nextIdx = buildEventIndex(nextData);
  // 地本×日付 → 今回の正規化タイトル一覧（O(n)。同日の件数は少ないので包含判定は線形でよい）
  const titlesByDay = new Map();
  for (const ev of nextIdx.values()) {
    const k = `${ev.pref}|${ev.date}`;
    if (!titlesByDay.has(k)) titlesByDay.set(k, []);
    titlesByDay.get(k).push(normForDedup(ev.title || ''));
  }
  // 同じ日のイベントのタイトルが一致、または一方が他方を含む（「広報活動 ふじざくらFC」⊃「ふじざくらＦＣ」）
  // ＝取得経路が変わって別 id になっただけとみなす
  const mergedInto = (p) => {
    const t = normForDedup(p.title || '');
    if (t.length < 3) return false;
    return (titlesByDay.get(`${p.pref}|${p.date}`) || []).some(n => n.length >= 3 && (n === t || n.includes(t) || t.includes(n)));
  };
  const missing = [];
  for (const [id, p] of buildEventIndex(prevData)) {
    if (nextIdx.has(id) || isEnded(p, today) || p.status === 'cancelled') continue;
    let reason = 'unexplained';
    if (quarantineIds.has(id)) reason = 'quarantined';
    else if (mergedInto(p)) reason = 'merged';
    else if (isCountable && !isCountable(p)) reason = 'filtered';
    missing.push({ id, pref: p.pref, date: p.date, title: p.title, source_type: p.source_type || '', reason });
  }
  return missing;
}

/**
 * 原因不明の消失を地本ごとに集計し、まとまって消えた地本をエラーにする。
 * @returns {Array<{pref, missing, previous, level}>}
 */
function summarizeMissingByPref(missing, prevData, { today, isCountable } = {}) {
  const prev = futureEventsByPref(prevData, today, isCountable);
  const byPref = {};
  for (const m of missing) if (m.reason === 'unexplained') byPref[m.pref] = (byPref[m.pref] || 0) + 1;
  return Object.entries(byPref).map(([pref, n]) => {
    const p = (prev[pref] || []).length;
    const level = (n >= MISSING_ERROR_MIN && n >= p * MISSING_ERROR_RATIO) ? 'error' : 'warning';
    return { pref, missing: n, previous: p, level };
  });
}

/** 全国総数の変化（補助判定）。 */
function analyzeTotalDrop(prevTotal, total) {
  if (!(prevTotal > 0)) return null;
  const drop = (prevTotal - total) / prevTotal;
  if (drop >= TOTAL_THRESHOLDS.ERROR_DROP) return { level: 'error', drop, previous: prevTotal, current: total };
  if (drop >= TOTAL_THRESHOLDS.WARN_DROP) return { level: 'warning', drop, previous: prevTotal, current: total };
  return null;
}

/** 公開データから内部専用のメタデータ（__ で始まる項目）を除く。 */
function stripInternalFields(ev) {
  const out = {};
  for (const [k, v] of Object.entries(ev || {})) if (!k.startsWith('__')) out[k] = v;
  return out;
}

module.exports = {
  PROTECTED_FIELDS, CRITICAL_FIELDS, NOTES_KEYWORDS, PREF_THRESHOLDS, TOTAL_THRESHOLDS,
  MISSING_ERROR_MIN, MISSING_ERROR_RATIO,
  isBlankValue, isValidLocation, isMissingField, canonicalUrl, buildEventIndex, isEnded, isCancelledEvent,
  sameSource, sameEventIdentity, isExplicitlyRemoved, samePlace, isDegradedVariant, lostNotesKeywords,
  mergeNonRegressiveEvent, futureEventsByPref, analyzePrefCountRegressions, carryOverVanishedPrefs,
  analyzeEventRegressions, analyzeMissingEvents, summarizeMissingByPref, analyzeTotalDrop, stripInternalFields,
};
