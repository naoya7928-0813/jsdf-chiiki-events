/**
 * 端末の画面の向きロックを「できる環境でだけ」試みる。
 *
 * 重要な前提:
 *   Web から端末の回転ロックを上書きする手段は限られている。
 *   - iOS Safari は Screen Orientation API の lock() を実装していない。
 *     PWA としてホーム画面に追加しても、manifest の orientation は無視される。
 *     → iPhone / iPad では「端末の縦向きロックより優先」は実現できない。
 *   - Android Chrome は lock() を持つが、全画面（fullscreen）か
 *     インストール済み PWA でないと拒否される。
 *
 * したがってアプリ側の設定は「レイアウトの選択」を主とし、
 * 端末の向きロックはここでのベストエフォートに留める。
 * 失敗しても例外を投げず、レイアウト設定だけは必ず効くようにする。
 */

/** この環境で向きロックを試せるか */
export function canLockOrientation() {
  try {
    return typeof screen !== 'undefined'
      && !!screen.orientation
      && typeof screen.orientation.lock === 'function';
  } catch { return false; }
}

/**
 * 表示設定に応じて端末の向きロックを試みる。
 * @param {'auto'|'landscape'|'portrait'} mode
 * @returns {Promise<'locked'|'unlocked'|'unsupported'|'rejected'>}
 */
export async function applyOrientationPreference(mode) {
  if (!canLockOrientation()) return 'unsupported';
  try {
    if (mode === 'auto') {
      // 解除は unlock()。未対応でも例外にしない。
      if (typeof screen.orientation.unlock === 'function') screen.orientation.unlock();
      return 'unlocked';
    }
    await screen.orientation.lock(mode === 'landscape' ? 'landscape' : 'portrait');
    return 'locked';
  } catch {
    // 全画面でない / OS 側が拒否 など。レイアウト設定だけは別途効いている。
    return 'rejected';
  }
}
