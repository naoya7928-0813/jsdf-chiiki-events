'use strict';

/**
 * パーサー共通ユーティリティ
 */

// 令和元年 = 2019年（令和1年 = 2019年、令和N年 = 2018 + N）
const REIWA_BASE = 2018;

/** 令和年 → 西暦 */
function reiwaToAD(n) {
  return REIWA_BASE + n;
}

/** 日付の数値を2桁ゼロ埋め */
function padTwo(n) {
  return String(n).padStart(2, '0');
}

/**
 * 全角英数字・記号を半角に変換
 * 例: "４月２６日" → "4月26日", "１０：００" → "10:00"
 */
function toHalfWidth(str) {
  return str
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
    .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ':')
    .replace(/〜|～/g, '～'); // 波ダッシュを統一
}

/** 現在の JST 年（西暦）を返す */
function jstYear() {
  return Number(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 4));
}

/**
 * ISO8601日付文字列が今日より過去かどうか判定（JST 基準）
 * 当日のイベントは表示する（isPast = false）
 */
function isPast(dateStr) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return dateStr < today;
}

/**
 * イベントタイトルからカテゴリを推定。
 * カテゴリは固定9値（説明会/採用イベント/一般公開/艦艇公開/体験/演奏会/記念行事/
 * 広報活動/地域参加）。タグ(guessTags)とあわせて、カード記述ルールの正準は
 * CLAUDE.md「イベントカード記述ルール（正準仕様）」を参照。9値以外は返さないこと。
 */
function guessCategory(title) {
  // ── 採用・就職系 ──────────────────────────────────────────
  if (/オープンキャンパス|Open.?Campus/.test(title))                              return '説明会';
  if (/採用試験|試験/.test(title))                                                 return '採用イベント';
  if (/キャリア|就職|お仕事セミナー|仕事体験|職業体験|ガールズトーク|女性向け|学園祭|大学祭|レンサルティング/.test(title)) return '採用イベント';
  if (/説明会|ガイダンス|制度説明|募集案内|セミナー/.test(title))                  return '説明会';
  if (/募集/.test(title))                                                          return '説明会';
  if (/相談会|座談会/.test(title))                                                 return '説明会';
  if (/交流会/.test(title))                                                        return '地域参加';

  // ── 基地・艦艇 公開 ──────────────────────────────────────
  if (/一般公開|基地公開|駐屯地公開|開放デー/.test(title))                         return '一般公開';
  if (/護衛艦|潜水艦|掃海艦|掃海艇|ミサイル艇|支援艦|補給艦|輸送艦|艦艇|乗艦/.test(title)) return '艦艇公開';

  // ── 体験 ────────────────────────────────────────────────
  if (/体験搭乗|体験飛行|ヘリ体験|操縦体験|操縦教育/.test(title))                  return '体験';
  if (/見学|体験|FAMILY|ファミリー|体感/.test(title))                              return '体験';

  // ── 音楽・演奏 ──────────────────────────────────────────
  if (/演奏会|コンサート|音楽隊/.test(title))                                      return '演奏会';

  // ── 式典・記念 ──────────────────────────────────────────
  if (/記念行事|記念式典|観閲式|式典|周年記念/.test(title))                        return '記念行事';
  if (/記念|創立|周年/.test(title))                                                 return '記念行事';

  // ── 装備・車両展示 ──────────────────────────────────────
  if (/はたらく車|働く車|はたらくくるま|はたらくクルマ|働くクルマ|がんばる車|はたらく乗り物|働く乗り物|車両展示|装備品|自衛隊展|自衛隊車両|特別展示/.test(title)) return '広報活動';

  // ── 地域まつり・マルシェ参加 ─────────────────────────────
  if (/まつり|祭り|マルシェ|フェスタ|フェスティバル|こどもまつり|子どもまつり|感謝祭|縁日|ウォーキング/.test(title)) return '地域参加';
  if (/フェス|THANKS|ミーティング|こもれび|イコット|GW|ユメタウン|ゆめタウン|ゆめタウン|ショッピング|イオン|ボートレース|パーク|ランニング|サッカー|野球|スタジアム/.test(title)) return '地域参加';

  // ── 広報活動（その他） ──────────────────────────────────
  return '広報活動';
}

/**
 * タイトル・備考からタグを配列で推定（複数マッチ対応）
 * text は title + notes など複数フィールドを結合して渡すこと
 */
function guessTags(text) {
  const tags = [];
  if (/無料|入場無料/.test(text))                  tags.push('入場無料');
  if (/予約|申込|申し込み|事前|事前登録/.test(text)) tags.push('要予約');
  if (/オンライン|Zoom|zoom|ウェブ/.test(text))     tags.push('オンライン');
  if (/家族|子ども|お子|ファミリー|親子/.test(text)) tags.push('家族向け');
  if (/高校生|中学生|学生|大学生|学校/.test(text))  tags.push('学生向け');
  if (/抽選/.test(text))                           tags.push('抽選');
  if (/個別/.test(text))                           tags.push('個別');
  if (/OB|OG|元自衛官/.test(text))                tags.push('OB・OG');
  return tags;
}

/**
 * 後方互換：先頭タグのみ返す（既存パーサーが tag: guessTag(...) で呼んでいる箇所用）
 * 新規コードは guessTags を使うこと。
 */
function guessTag(text) {
  return guessTags(text)[0] ?? '';
}

const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

/** 国民の祝日・振替休日（2025〜2027） */
const HOLIDAYS_JP = new Set([
  // 2025
  '2025-01-01', '2025-01-13', '2025-02-11', '2025-02-23', '2025-02-24',
  '2025-03-20', '2025-04-29', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-06', '2025-07-21', '2025-08-11', '2025-09-15', '2025-09-23',
  '2025-10-13', '2025-11-03', '2025-11-23', '2025-11-24',
  // 2026
  '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23',
  '2026-03-20', '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-05-06', '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22',
  '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23',
  // 2027
  '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23',
  '2027-03-21', '2027-03-22', '2027-04-29', '2027-05-03', '2027-05-04',
  '2027-05-05', '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23',
  '2027-10-11', '2027-11-03', '2027-11-23',
]);

/**
 * ISO8601日付文字列から日本語曜日を返す
 * 祝日の場合は「X・祝」形式
 */
function calcWeekday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const w = WEEKDAY_JP[d.getDay()];
  return HOLIDAYS_JP.has(dateStr.slice(0, 10)) ? `${w}・祝` : w;
}

/**
 * 日付 + タイトルから順番に依存しない安定した短いハッシュを生成。
 * 同一スクレイプ実行内で処理順が変わってもIDが変わらないようにする。
 */
function titleHash(date, title) {
  const key = `${date}|${title}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h) ^ key.charCodeAt(i);
  return (h >>> 0).toString(36).padStart(5, '0').slice(-5);
}

module.exports = { reiwaToAD, padTwo, toHalfWidth, jstYear, isPast, guessCategory, guessTag, guessTags, calcWeekday, titleHash };
