/**
 * 旧ドメイン（*.vercel.app）から移ってきたときの設定の受け取り
 *
 * 旧ドメインの引っ越し用ページが、端末内の設定を URL の # 以降に載せて .jp へ移してくる
 * （仕組みは shared/domainMigration.cjs）。ここでそれを localStorage に書き、すぐ URL から消す。
 *
 * ⚠ main.jsx の**最初の import** にすること。
 *   - App が localStorage を読む前に書き込む必要がある
 *   - アクセス解析（injectAnalytics）が URL を拾う前に # 以降を消す必要がある
 */
import {
  payloadFromHash, hashWithoutPayload, planImport, HASH_PARAM,
} from '../../shared/domainMigration.cjs';

// 今回の読み込みで引き継いだか。端末には保存しない（保存項目を増やすとプライバシーポリシーの改定と
// 全員の再同意が要る）。同意画面のあとに App が表示されても、同じページ読み込みの間は残る
let migratedThisLoad = false;

/** 今回の読み込みで旧ドメインから設定を引き継いだか（お知らせの文面を変えるのに使う） */
export function wasMigratedOnThisLoad() { return migratedThisLoad; }

function run() {
  if (typeof window === 'undefined') return;
  const { hash } = window.location;
  if (!hash || !hash.includes(HASH_PARAM)) return;

  // 中身が読めなくても、# 以降は必ず消す（URL に残すと共有・ブックマークに混ざる）
  try {
    const payload = payloadFromHash(hash);
    if (payload) {
      const entries = planImport(payload, (k) => window.localStorage.getItem(k));
      for (const [k, v] of entries) {
        try { window.localStorage.setItem(k, v); } catch { /* 容量不足などは諦める */ }
      }
      migratedThisLoad = true;
    }
  } catch { /* 引き継げなくても画面は普通に出す */ }

  try {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', pathname + search + hashWithoutPayload(hash));
  } catch { /* noop */ }
}

run();
