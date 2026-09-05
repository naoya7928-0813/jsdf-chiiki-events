'use strict';
/**
 * domainNotice — ドメイン移行のお知らせを出すかどうかの判定
 *
 * 2026-09-03 に公開URLを `*.vercel.app` から `jsdf-chiiki-events.jp` へ移した。
 * オリジンが変わるとブラウザの保存領域は別物になるため、**利用者から見ると
 * お気に入り・配色などの設定・通知の登録がすべて消えたように見える**。
 * 何も言わずにそうなると「壊れた」と受け取られるので、開いたときに一度だけ知らせる。
 *
 * 出し分けは「今どのドメインを見ているか」で決まる:
 *
 *   旧ドメイン（LEGACY_ORIGINS）… `moved-away`
 *     「引っ越しました」＋新しいURLへ移動するボタン。まだリダイレクトを
 *     設定していない期間の導線。ここを見ている人は移行を知らない
 *
 *     ⚠ 旧ドメインでは**閉じた記録を無視して毎回出す**。移行後の旧ドメインは
 *       最新データを取れず、アプリが「オフラインです」と表示してしまう
 *       （通信の問題ではなく、引っ越したことが原因）。一度閉じたら黙る作りだと
 *       間違った説明だけが残るので、正しい案内を出し続ける。
 *       あわせて App.jsx は旧ドメインでオフラインのお知らせを出さない。
 *
 *   新ドメイン（DEFAULT_SITE_URL）… `moved-here`
 *     「アドレスが変わりました。設定は引き継がれません」。
 *     お気に入りが空になっている理由を説明する
 *
 *   それ以外（localhost・プレビュー・www 等）… 出さない
 *     開発中や検証用のURLで出しても意味がない
 *
 * ⚠ 期限（SHOW_UNTIL）を過ぎたら出さない。移行から時間が経つと、
 *   新規の利用者にとっては「知らないサイトからの引っ越し」の話になり、
 *   かえって混乱させる。消し忘れを防ぐためコード側で切る。
 */

const { DEFAULT_SITE_URL, LEGACY_ORIGINS } = require('./siteUrl.cjs');

/** 閉じた記録を入れる localStorage のキー */
const NOTICE_KEY = 'jsdf-domain-notice';

/**
 * お知らせの版。閉じた記録がこの値と一致していれば出さない。
 * 内容を作り直してもう一度見せたいときはここを上げる。
 */
const NOTICE_VERSION = '2026-09-05';

/** この日（JST）を過ぎたら出さない。移行の告知は期間限定でよい */
const SHOW_UNTIL = '2026-12-31';

/** URL からホスト名を取り出す（不正な値は null） */
function hostOf(url) {
  try { return new URL(url).host; } catch { return null; }
}

/** 旧ドメインのホスト名一覧 */
function legacyHosts() {
  return LEGACY_ORIGINS.map(hostOf).filter(Boolean);
}

/** 新ドメインのホスト名 */
function currentHost() {
  return hostOf(DEFAULT_SITE_URL);
}

/** いま見ているのが移行元（捨てた）ドメインか */
function isLegacyHost(host) {
  return legacyHosts().includes(String(host || '').toLowerCase());
}

/**
 * お知らせを出すか、出すならどちらの文面かを決める。
 *
 * @param {object}  o
 * @param {string}  o.host       いま見ているホスト名（location.host）
 * @param {string?} o.dismissed  localStorage に入っている「閉じた記録」
 * @param {string}  o.today      JST の今日（YYYY-MM-DD）
 * @returns {{ show: boolean, mode: 'moved-away'|'moved-here'|null, newUrl: string }}
 */
function decideDomainNotice({ host, dismissed, today }) {
  const none = { show: false, mode: null, newUrl: DEFAULT_SITE_URL };

  // 期限切れ。文字列比較で足りる（どちらも YYYY-MM-DD）
  if (!today || today > SHOW_UNTIL) return none;

  const h = String(host || '').toLowerCase();
  if (!h) return none;

  // 旧ドメインは「閉じた記録」を見ない（毎回出す）。
  // ここは移行が済んだドメインで、閉じたあとに残るのは
  // 「オフラインです」という誤った説明だけになるため。
  if (isLegacyHost(h)) return { show: true, mode: 'moved-away', newUrl: DEFAULT_SITE_URL };

  // 新ドメインは一度閉じたら出さない（毎回出す必要はない）
  if (dismissed === NOTICE_VERSION) return none;
  if (h === currentHost()) return { show: true, mode: 'moved-here', newUrl: DEFAULT_SITE_URL };

  // localhost・プレビュー・www など。移行の当事者ではないので出さない
  return none;
}

module.exports = {
  NOTICE_KEY, NOTICE_VERSION, SHOW_UNTIL,
  hostOf, legacyHosts, currentHost, isLegacyHost, decideDomainNotice,
};
