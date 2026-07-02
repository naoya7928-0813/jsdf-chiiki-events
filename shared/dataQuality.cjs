// events.json のデータ品質検証（純粋）。CI（scripts/check-data-quality.mjs）から使う。
// errors = デプロイ停止、warnings = 通知のみ。
'use strict';

const { isRealDate } = require('./weather.cjs');
const { isJunkOrStubTitle } = require('./titleQuality.cjs');

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
 * @param {object} [opts] { prevTotal?:number, manualIds?:Set<string>, dropRatio?:number }
 * @returns {{errors:string[], warnings:string[], total:number, byAccuracy:object}}
 */
function validateEventsData(data, opts = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Map(); // id → "pref/title" 最初の出現
  let total = 0;
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

      // URL 形式（警告）
      if (ev.url && !/^https?:\/\//i.test(String(ev.url))) warnings.push(`${loc} URL 形式が不正: "${ev.url}"`);

      // 会場情報（警告）
      if (!ev.place || !String(ev.place).trim()) warnings.push(`${loc} 会場情報(place)がありません`);

      // 「公式確認」スタブ（office_notice）の混入（2026-07-02 生成廃止。偽の開催日を持つ疑似イベント）
      if (ev.source_type === 'office_notice') {
        warnings.push(`${loc} 廃止済みの office_notice スタブが混入: "${(ev.title || '').slice(0, 30)}"`);
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

  // 総数の異常減少（前回比）
  if (typeof opts.prevTotal === 'number' && opts.prevTotal > 0) {
    const ratio = opts.dropRatio || 0.5; // 既定: 半減でエラー
    if (total < opts.prevTotal * ratio) {
      errors.push(`イベント総数が異常に減少: 前回 ${opts.prevTotal} → 今回 ${total}`);
    }
  }

  return { errors, warnings, total, byAccuracy };
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

module.exports = { validateEventsData, uniquifyIds, PREF_KEYS, ACCURACY_OK };
