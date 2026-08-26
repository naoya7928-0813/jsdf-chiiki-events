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

/**
 * 初回同意時に示す要点。
 * リンクを置くだけでは「何に同意するのか」が伝わらないため、
 * 判断に必要な点だけを先に示す（全文は同じ画面から読める）。
 */
export const LEGAL_SUMMARY = [
  '本アプリは有志が運営する非公式アプリです。防衛省・自衛隊とは関係ありません。',
  'イベント情報は各地本の公式サイトから自動取得したものです。正確性は保証できないため、参加前に必ず公式サイトでご確認ください。',
  'お気に入り・設定・同意の記録は、お使いの端末内にのみ保存します。',
  '通知・天気・地図・不具合報告をお使いになるときだけ、必要な情報を外部サービスへ送信します。',
  '表示速度と使い勝手の改善のため、利用状況を統計的に計測しています（個人の特定や他サイトをまたいだ追跡は行いません）。',
];

/**
 * 同意済みの版を読み出す。
 * localStorage が使えない環境（プライベートモード・ストレージ拒否）でも
 * 同じセッション中に何度も同意を求めないよう、sessionStorage も見る。
 */
export function loadAcceptedLegalVersion() {
  try {
    const v = localStorage.getItem(LEGAL_STORAGE_KEY);
    if (v) return v;
  } catch { /* 読めない環境 */ }
  try { return sessionStorage.getItem(LEGAL_STORAGE_KEY); } catch { return null; }
}

/**
 * 同意を記録する。
 * localStorage に書けない環境では sessionStorage に退避する。
 * これが無いと、そうした環境で読み込みのたびに同意画面が出て
 * 「改定時に1度だけ」という約束が守れない。
 */
export function saveAcceptedLegalVersion(version = LEGAL_VERSION) {
  let stored = false;
  try { localStorage.setItem(LEGAL_STORAGE_KEY, version); stored = true; } catch { /* 次で退避 */ }
  if (stored) return;
  try { sessionStorage.setItem(LEGAL_STORAGE_KEY, version); } catch { /* 保存できなくても利用は妨げない */ }
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
