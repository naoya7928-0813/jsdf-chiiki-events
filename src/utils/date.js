// ─── 日付ユーティリティ ──────────────────────────────────────

/** ISO日付文字列（YYYY-MM-DD）から今日までの残り日数 */
export function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target - today) / 86400000);
}

/**
 * "4月24日（金）" 形式の締切文字列を Date に変換する。
 * 年が省略されているため、過去30日より前なら翌年とみなす。
 */
export function parseDeadlineDate(str) {
  if (!str) return null;
  const m = str.match(/(\d+)月(\d+)日/);
  if (!m) return null;
  const year = new Date().getFullYear();
  const d = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
  const now = new Date();
  // 30日以上前なら翌年として扱う
  if (d < now && now - d > 30 * 86400000) d.setFullYear(year + 1);
  return d;
}

/** 締切文字列から残り日数を返す（取得できなければ null） */
export function deadlineDaysUntil(str) {
  const d = parseDeadlineDate(str);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
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
export function daysColor(days, primary, accent) {
  if (days <= 0)  return '#ef4444'; // 赤
  if (days <= 1)  return '#ef4444'; // 赤
  if (days <= 3)  return '#f97316'; // 橙
  if (days <= 7)  return accent;    // アクセント
  return primary;
}
