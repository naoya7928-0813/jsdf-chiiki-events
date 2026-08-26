/**
 * 規約・プライバシーポリシーの同意バージョン管理
 *
 * 本アプリは、利用者の情報の取扱いに関わる改定を行ったとき、
 * 各利用者に一度だけ再同意を求める（同意が得られない場合は利用させない）。
 * その判定に使うのがこのファイル。
 *
 * 【改定したときの手順】
 *   1. src/constants/privacy.js / terms.js を修正する
 *   2. LEGAL_VERSION を新しい日付に上げる（これが同意の記録キーになる）
 *   3. LEGAL_REVISED_AT を表示用の日付に更新する
 *   4. LEGAL_CHANGES に「何が変わったか」を利用者向けの言葉で書く
 *   ※ 2 を上げ忘れると、改定しても再同意が求められない（＝古い同意のまま使われる）
 */

/** 同意の版。この値が localStorage の記録と異なると再同意を求める */
export const LEGAL_VERSION = '2026-08-26';

/** 表示用の改定日 */
export const LEGAL_REVISED_AT = '2026年8月26日';

/** localStorage のキー（値＝同意した LEGAL_VERSION） */
export const LEGAL_STORAGE_KEY = 'jsdf-legal-accepted';

/**
 * 今回の改定内容（利用者向けの要約）。
 * 再同意ダイアログに箇条書きで表示する。
 */
export const LEGAL_CHANGES = [
  '実際のアプリの動作に合わせて、記載を全面的に見直しました。',
  '表示速度と使い勝手の改善のために利用状況の計測（Vercel Web Analytics / Speed Insights）を使用していることを明記しました。追跡用 Cookie は使用せず、個人の特定や他サイトをまたいだ追跡は行いません。',
  '「近くの募集案内所」で使う位置情報と方位センサーについて、端末内でのみ処理し外部へ送信しないことを明記しました。',
  'イベント詳細の地図が Google マップの埋め込みであり、表示時に Google 社へ IP アドレス等が送信されることを明記しました。',
  '不具合報告の内容・連絡先を外部サービスへ送信しない運用（2026年7月に移行済み）に記載を合わせました。',
  'オフラインでの閲覧のために、最後に取得したイベント情報を端末内に保持することを追記しました。',
];

/** 同意済みの版を読み出す（読めない環境では null） */
export function loadAcceptedLegalVersion() {
  try { return localStorage.getItem(LEGAL_STORAGE_KEY); } catch { return null; }
}

/** 同意を記録する */
export function saveAcceptedLegalVersion(version = LEGAL_VERSION) {
  try { localStorage.setItem(LEGAL_STORAGE_KEY, version); } catch { /* 保存できなくても利用は妨げない */ }
}

/**
 * 同意画面を出す必要があるか。
 * @param {string|null} accepted 記録されている同意版
 * @returns {'none'|'initial'|'revised'} none=不要 / initial=初回 / revised=改定による再同意
 */
export function consentStateFor(accepted) {
  if (!accepted) return 'initial';
  if (accepted !== LEGAL_VERSION) return 'revised';
  return 'none';
}
