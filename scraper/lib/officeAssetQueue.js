'use strict';
const { sortByPriority } = require('./priority');
const { normalizeUrl } = require('./normalizeUrl');

// Rotate eligible documents so the first two flyers cannot starve later ones.
// Downloads and OCR still use the existing conditional-GET/hash-cache pipeline.
function planOfficeAssets(assets, limit, runNumber = 0) {
  const unique = [...new Map(assets.map(a => [normalizeUrl(a.url), a])).values()];
  const eligible = sortByPriority(unique).filter(a => a.forceOcr || a.priority !== 'low');
  const offset = eligible.length ? (Math.max(0, Number(runNumber) || 0) * limit) % eligible.length : 0;
  const rotated = [...eligible.slice(offset), ...eligible.slice(0, offset)];
  return { selected: rotated.slice(0, limit), deferred: Math.max(0, eligible.length - limit),
    eligible: eligible.length, ignored: unique.length - eligible.length };
}
module.exports = { planOfficeAssets };
