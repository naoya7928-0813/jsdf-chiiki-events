'use strict';

const HIGH_KW = /説明会|相談会|採用|自衛官|公安職|募集案内|ガイダンス|セミナー|インターン|体験入隊|体験入校|個別相談/;
const MED_KW  = /体験|見学|搭乗|乗艦|乗船|航海|飛行|一般公開|記念行事|防衛|訓練参加/;
const SKIP_KW = /アルバム|活動報告|スタッフ紹介|広報誌|過去のイベント|終了しました|中止/;

const HIGH_PAGE = /recruit|saiyou|boshu|annaisho|event|oshirase/i;

/**
 * アセットの優先度を返す: 'high' | 'medium' | 'low'
 * @param {{normalized:string, linkText:string, type:'pdf'|'image'}} asset
 * @param {string} sourcePageUrl
 * @returns {'high'|'medium'|'low'}
 */
function getPriority(asset, sourcePageUrl) {
  const text = asset.linkText + ' ' + asset.normalized;

  if (SKIP_KW.test(text)) return 'low';

  const isRecruitPage = HIGH_PAGE.test(sourcePageUrl || '');

  if (HIGH_KW.test(text) || isRecruitPage) return 'high';
  if (MED_KW.test(text))                   return 'medium';
  if (asset.type === 'pdf')                 return 'medium';
  return 'low';
}

/**
 * アセット配列を優先度でソートし、low は末尾に並べる。
 */
function sortByPriority(assets) {
  const order = { high: 0, medium: 1, low: 2 };
  return assets
    .map(a => ({ ...a, priority: getPriority(a, a.sourcePageUrl) }))
    .sort((a, b) => order[a.priority] - order[b.priority]);
}

module.exports = { getPriority, sortByPriority };
