'use strict';

/**
 * 函館地本イベントページのパーサー
 * URL: https://www.mod.go.jp/pco/hakodate/publicity/
 *
 * 注意: 令和7年度（2025年4月）以降、函館地本はInstagramでのみイベント情報を更新。
 *       構造化データなし → 常に空配列を返す。
 *
 * @returns {Array<Object>}
 */
function parseHakodate() {
  return [];
}

module.exports = { parseHakodate };
