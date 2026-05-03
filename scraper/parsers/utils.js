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

/**
 * ISO8601日付文字列が今日より過去かどうか判定
 * 当日のイベントは表示する（isPast = false）
 */
function isPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
}

/**
 * イベントタイトルからカテゴリを推定
 */
function guessCategory(title) {
  // ── 採用・就職系 ──────────────────────────────────────────
  if (/オープンキャンパス|Open.?Campus/.test(title))                              return 'オープンキャンパス';
  if (/採用試験|試験/.test(title))                                                 return '採用試験';
  if (/キャリア|就職|お仕事セミナー|仕事体験|職業体験|ガールズトーク|女性向け|学園祭|大学祭|レンサルティング/.test(title)) return '採用イベント';
  if (/説明会|ガイダンス|制度説明|募集案内|セミナー/.test(title))                  return '説明会';
  if (/募集/.test(title))                                                          return '説明会';
  if (/相談会/.test(title))                                                        return '相談会';
  if (/座談会/.test(title))                                                        return '座談会';
  if (/交流会/.test(title))                                                        return '交流会';

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
  if (/はたらく車|働く車|はたらくくるま|はたらくクルマ|働くクルマ|がんばる車|はたらく乗り物|働く乗り物|車両展示|装備品|自衛隊展|自衛隊車両|特別展示/.test(title)) return '装備展示';

  // ── 地域まつり・マルシェ参加 ─────────────────────────────
  if (/まつり|祭り|マルシェ|フェスタ|フェスティバル|こどもまつり|子どもまつり|感謝祭|縁日|ウォーキング/.test(title)) return '地域参加';

  // ── 広報活動（その他） ──────────────────────────────────
  return '広報活動';
}

/**
 * タイトル・備考からタグを推定
 */
function guessTag(text) {
  if (/無料|入場無料/.test(text))              return '入場無料';
  if (/予約|申込|申し込み|事前/.test(text))    return '要予約';
  if (/オンライン|Zoom|zoom/.test(text))       return 'オンライン';
  if (/家族|子ども|お子|ファミリー/.test(text)) return '家族向け';
  if (/高校生|学生|大学生/.test(text))          return '学生向け';
  if (/抽選/.test(text))                       return '抽選';
  if (/個別/.test(text))                       return '個別';
  if (/OB|OG|元自衛官/.test(text))            return 'OB・OG';
  return '';
}

module.exports = { reiwaToAD, padTwo, toHalfWidth, isPast, guessCategory, guessTag };
