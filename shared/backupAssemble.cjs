// バックアップの組み立て（純粋・ブラウザ/Node 共通。node:crypto に依存しない）。
// 監査ログはページ単位で取得するため、管理画面（ブラウザ）で本体とページ群を1ファイルにまとめる。
// ハッシュの計算・検証は shared/backupFormat.cjs（Node 側）が行う。
'use strict';

const AUDIT_PAGE_SIZE = 500;

/**
 * 本体（buildCoreBackup の結果）と監査ページ群から最終ファイルを組み立てる。
 * ページは古い順（page 0 が最古）。各ページの sha256 はサーバーが計算したものをそのまま残す。
 */
function assembleBackup(core, auditPages = []) {
  const pages = [...auditPages].sort((a, b) => a.page - b.page);
  const entries = pages.flatMap(p => p.entries || []);
  return {
    manifest: {
      ...core.manifest,
      sections: {
        ...core.manifest.sections,
        audit: {
          count: entries.length, order: 'oldest_first', pageSize: AUDIT_PAGE_SIZE,
          pages: pages.map(p => ({ page: p.page, count: p.count, sha256: p.sha256 })),
        },
      },
    },
    sections: { ...core.sections, audit: entries },
  };
}

/** ダウンロード用のファイル名（jsdf-backup-YYYYMMDD-HHmm.json、JST）。 */
function backupFileName(isoCreatedAt) {
  const t = new Date(Date.parse(isoCreatedAt) + 9 * 3600 * 1000).toISOString();
  return `jsdf-backup-${t.slice(0, 10).replace(/-/g, '')}-${t.slice(11, 16).replace(':', '')}.json`;
}

module.exports = { AUDIT_PAGE_SIZE, assembleBackup, backupFileName };
