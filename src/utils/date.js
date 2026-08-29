// ─── 日付ユーティリティ（すべて JST 基準） ───────────────────────

/** 現在の JST 日付を "YYYY-MM-DD" 文字列で返す */
function jstTodayStr() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * ISO日付文字列（YYYY-MM-DD）から JST 今日までの残り日数。
 * 両日付を UTC 深夜0時として差分を計算するため TZ 非依存。
 */
export function daysUntil(dateStr) {
  const today  = new Date(jstTodayStr() + 'T00:00:00Z');
  const target = new Date(dateStr       + 'T00:00:00Z');
  return Math.ceil((target - today) / 86400000);
}

/**
 * "4月24日（金）" 形式の締切文字列を Date（UTC 深夜0時）に変換する。
 * 年が省略されているため JST の現在年を使用し、
 * 30日以上過去なら翌年とみなす。
 */
export function parseDeadlineDate(str) {
  if (!str) return null;
  const m = str.match(/(\d+)月(\d+)日/);
  if (!m) return null;

  const todayStr = jstTodayStr();
  const year  = parseInt(todayStr.slice(0, 4));
  const month = parseInt(m[1]);
  const day   = parseInt(m[2]);
  const pad   = n => String(n).padStart(2, '0');

  let dStr = `${year}-${pad(month)}-${pad(day)}`;
  let d    = new Date(dStr + 'T00:00:00Z');
  const today = new Date(todayStr + 'T00:00:00Z');

  // 30日以上前なら翌年として扱う
  if (d < today && today - d > 30 * 86400000) {
    dStr = `${year + 1}-${pad(month)}-${pad(day)}`;
    d    = new Date(dStr + 'T00:00:00Z');
  }
  return d;
}

/** 締切文字列から残り日数を返す（取得できなければ null） */
export function deadlineDaysUntil(str) {
  const d = parseDeadlineDate(str);
  if (!d) return null;
  const today = new Date(jstTodayStr() + 'T00:00:00Z');
  return Math.ceil((d - today) / 86400000);
}

/**
 * 残り日数を日本語ラベルに変換する。
 * @param {number} days - 残り日数
 * @param {'event'|'deadline'} type
 */
export function daysLabel(days, type = 'event') {
  if (days < 0)  return null;
  if (days === 0) return type === 'deadline' ? '本日締切' : '本日開催';
  if (days === 1) return type === 'deadline' ? '明日締切' : '明日開催';
  return `あと${days}日`;
}

/** 残り日数に応じた色を返す */
/**
 * 日数バッジの「文字・アイコン用」の色。
 * ブランド色（primary/accent）は白地前提の濃い色で、ダークの面に文字として
 * 置くと読めないため、テーマで切り替わる CSS 変数を使う。
 * 背景の淡い塗り（`${色}18` のようにアルファを連結する用途）は
 * 変数を文字列連結できないので、従来どおり daysColor(days, primary, accent) を使う。
 */
export function daysFgColor(days) {
  return daysColor(days, 'var(--brand-fg)', 'var(--accent-fg)');
}

export function daysColor(days, primary, accent) {
  if (days <= 0)  return '#ef4444'; // 赤
  if (days <= 1)  return '#ef4444'; // 赤
  if (days <= 3)  return '#f97316'; // 橙
  if (days <= 7)  return accent;    // アクセント
  return primary;
}
