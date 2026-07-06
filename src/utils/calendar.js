// ─── カレンダー登録ユーティリティ ─────────────────────────────
// イベントカードのデータから Google カレンダーURL / ICS(RFC5545) を生成する。
// サーバー不要・外部ライブラリ不要。時刻は「HH:MM～HH:MM」形式のときのみ時間指定、
// それ以外（不明・終日・複数部制など）は終日イベントとして登録する。

/** "YYYY-MM-DD" → "YYYYMMDD" */
const dstr = (d) => String(d || '').replace(/-/g, '');

/** date の翌日（終日イベントの排他的終了日用） */
function nextDay(d) {
  const t = new Date(Date.parse(d + 'T00:00:00Z') + 86400000);
  return t.toISOString().slice(0, 10);
}

/** time "HH:MM～HH:MM" を解析（それ以外は null＝終日扱い） */
function parseTimeRange(time) {
  const m = String(time || '').match(/^(\d{1,2}):(\d{2})～(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const p = (n) => String(n).padStart(2, '0');
  return { start: `${p(m[1])}${m[2]}00`, end: `${p(m[3])}${m[4]}00` };
}

/** イベントの開始/終了（Google形式）。終日は排他的終了日 */
function calDates(ev) {
  const t = parseTimeRange(ev.time);
  if (t) {
    // 同日内の時間帯（複数日開催＋時刻の組合せは稀なので開催初日に登録）
    return { allDay: false, start: `${dstr(ev.date)}T${t.start}`, end: `${dstr(ev.date)}T${t.end}` };
  }
  const endEx = nextDay(ev.endDate || ev.date);
  return { allDay: true, start: dstr(ev.date), end: dstr(endEx) };
}

/** 説明文（公式URL・締切・非公式の注意書き） */
function buildDetails(ev) {
  const lines = [];
  if (ev.deadline) lines.push(`申込締切: ${ev.deadline}`);
  if (ev.url) lines.push(`公式ページ: ${ev.url}`);
  lines.push('', '※ 地本イベントナビ（非公式）から登録。開催・中止・変更は必ず公式情報をご確認ください。');
  return lines.join('\n');
}

/** Google カレンダー追加URL */
export function googleCalendarUrl(ev) {
  const { start, end } = calDates(ev);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || '自衛隊イベント',
    dates: `${start}/${end}`,
    details: buildDetails(ev),
    location: ev.place || ev.address || '',
    ctz: 'Asia/Tokyo',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** ICS テキストのエスケープ（RFC5545: バックスラッシュ・改行・カンマ・セミコロン） */
const icsEscape = (s) => String(s || '')
  .replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** ICS(RFC5545) 文字列を生成 */
export function buildIcs(ev) {
  const { allDay, start, end } = calDates(ev);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dt = allDay
    ? [`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`]
    // タイムゾーン定義を持ち歩かず、日本のローカル行事なので浮動時刻（端末ローカル）で登録する
    : [`DTSTART:${start}`, `DTEND:${end}`];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jsdf-chiiki-events//JP',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id || 'ev'}@jsdf-chiiki-events.vercel.app`,
    `DTSTAMP:${stamp}`,
    ...dt,
    `SUMMARY:${icsEscape(ev.title)}`,
    `LOCATION:${icsEscape(ev.place || ev.address || '')}`,
    `DESCRIPTION:${icsEscape(buildDetails(ev))}`,
    ...(ev.url ? [`URL:${ev.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** ICS をダウンロードさせる（iPhone/Outlook 等向け） */
export function downloadIcs(ev) {
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jsdf-event-${(ev.id || 'event').slice(0, 40)}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
