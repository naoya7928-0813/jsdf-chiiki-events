// ─── 新しい版に切り替わったら運営画面を読み直す ─────────────────
// admin.html は Service Worker が precache から返すため、デプロイ直後に開くと
// 「古い admin.html → 古い画面」が表示され、新しい SW が有効になった後も
// 開いているページは古いまま残る（2026-10-14 に新機能が出ないと報告あり）。
// 新しい SW が制御を引き継いだ（controllerchange）ときに読み直す。
//  - 開いた直後（RELOAD_WINDOW_MS 以内）は入力途中のものが無いので自動で読み直す
//  - それ以降は入力を失わないよう、画面下の案内から利用者が読み直す

const RELOAD_WINDOW_MS = 20_000;
const RELOAD_AT_KEY = 'jsdf-sw-reload-at';
const RELOAD_COOLDOWN_MS = 60_000; // 読み直しが繰り返されないようにする

function reloadedRecently() {
  try { return Date.now() - Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0) < RELOAD_COOLDOWN_MS; }
  catch { return false; }
}

function reload() {
  try { sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now())); } catch { /* ignore */ }
  window.location.reload();
}

function showUpdateNotice() {
  if (document.getElementById('sw-update-notice')) return;
  const bar = document.createElement('div');
  bar.id = 'sw-update-notice';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:9999;'
    + 'display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:12px;'
    + 'background:#0b2545;color:#fff;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:520px;margin:0 auto;';
  const text = document.createElement('span');
  text.textContent = '運営画面の新しい版があります。保存してから読み直してください。';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '読み直す';
  btn.style.cssText = 'flex-shrink:0;padding:7px 12px;border-radius:8px;border:none;background:#fff;color:#0b2545;font-weight:700;font-size:13px;cursor:pointer;';
  btn.addEventListener('click', reload);
  bar.append(text, btn);
  document.body.appendChild(bar);
}

export function reloadOnServiceWorkerUpdate() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // 初回（SW がまだ無い）は controllerchange が来ても中身は同じなので読み直さない
  if (!navigator.serviceWorker.controller) return;
  const loadedAt = Date.now();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (Date.now() - loadedAt <= RELOAD_WINDOW_MS && !reloadedRecently()) reload();
    else showUpdateNotice();
  });
  // 開きっぱなしの画面でも新しい版に気付けるよう、画面に戻ったときに更新を確認する
  const check = () => navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {});
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
