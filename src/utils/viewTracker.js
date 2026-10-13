/**
 * イベント詳細の閲覧を1回だけ数える（/api/view）。
 *
 * 送らない場合:
 *   - 同じタブで同じイベントを 30 分以内に開き直した（再読み込み・戻る/進む・自動更新を数えない）
 *   - 運営者としてログインしている（確認・編集のための閲覧で数字を膨らませない）
 *   - 自動操作のブラウザ（navigator.webdriver）・オフライン
 * 端末内には「送ったイベントIDと時刻」を sessionStorage に 30 分だけ置く（タブを閉じると消える）。
 * 失敗しても何もしない（閲覧の邪魔をしない）。
 */
import { shouldSendView, pruneSeen } from '../../shared/viewStats.cjs';

const KEY = 'jsdf-viewed';
const memory = {};   // sessionStorage が使えない環境の代わり（このページの間だけ）

function readSeen() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch { return memory; }
}
function writeSeen(seen) {
  try { sessionStorage.setItem(KEY, JSON.stringify(seen)); } catch { Object.assign(memory, seen); }
}

export function recordView(id, { admin = false } = {}) {
  try {
    if (!id || admin) return;
    if (typeof navigator !== 'undefined' && (navigator.webdriver || navigator.onLine === false)) return;
    const now = Date.now();
    const seen = pruneSeen(readSeen(), now);
    if (!shouldSendView(seen, id, now)) return;
    seen[id] = now;
    writeSeen(seen);
    fetch('/api/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      keepalive: true,       // すぐ別画面へ移っても送り切る
      credentials: 'omit',
    }).catch(() => {});
  } catch { /* 計測の失敗は無視 */ }
}
