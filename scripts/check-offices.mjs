import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline inventory validation: never contacts PCO websites.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/offices.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(path.join(root, 'docs/office-audit-20261004.json'), 'utf8'));
const errors = [];
const offices = data.offices;
if (!Array.isArray(offices)) throw new Error('offices must be an array');
const ids = new Set();
const recruitment = new Map();
const headquarters = new Map();
const legacyMissingAddresses = new Map(audit.baselineMissingAddresses.map(o => [o.id, o]));
for (const office of offices) {
  if (!office.id || ids.has(office.id)) errors.push(`Missing or duplicate ID: ${office.id}`);
  ids.add(office.id);
  for (const field of ['pref', 'name', 'url']) {
    if (typeof office[field] !== 'string' || !office[field].trim()) errors.push(`${office.id}: invalid ${field}`);
  }
  // Keep explicitly recorded pre-existing gaps separate from new/updated records.
  if (office.type !== 'cooperation' && !office.address?.trim()) {
    const legacy = legacyMissingAddresses.get(office.id);
    if (!legacy || legacy.pref !== office.pref || legacy.name !== office.name) errors.push(`${office.id}: new missing address`);
  }
  if (!['hq', 'recruitment', 'cooperation'].includes(office.type)) errors.push(`${office.id}: invalid type`);
  if (!Number.isFinite(office.lat) || office.lat < 20 || office.lat > 46 ||
      !Number.isFinite(office.lng) || office.lng < 122 || office.lng > 154) errors.push(`${office.id}: invalid Japan coordinates`);
  if ('latApprox' in office && typeof office.latApprox !== 'boolean') errors.push(`${office.id}: invalid latApprox`);
  try {
    const url = new URL(office.url);
    if (url.protocol !== 'https:') errors.push(`${office.id}: non-HTTPS URL`);
  } catch { errors.push(`${office.id}: invalid URL`); }
  if (office.type === 'hq') headquarters.set(office.pref, (headquarters.get(office.pref) || 0) + 1);
  if (office.type === 'recruitment') {
    const names = recruitment.get(office.pref) || new Set();
    if (names.has(office.name)) errors.push(`${office.pref}: duplicate office name ${office.name}`);
    names.add(office.name);
    recruitment.set(office.pref, names);
  }
}
const expectedPrefs = Object.keys(audit.expectedDraftNames).sort();
if (expectedPrefs.length !== 50 || [...headquarters.keys()].sort().join() !== expectedPrefs.join() ||
    [...recruitment.keys()].sort().join() !== expectedPrefs.join()) errors.push('Expected all 50 PCOs in both hq and recruitment');
for (const pref of expectedPrefs) {
  if (headquarters.get(pref) !== 1) errors.push(`${pref}: expected one headquarters`);
  const actual = [...(recruitment.get(pref) || [])].sort();
  const expected = [...audit.expectedDraftNames[pref]].sort();
  if (actual.join('\n') !== expected.join('\n')) errors.push(`${pref}: inventory differs from reviewed snapshot`);
}
const byId = new Map(offices.map(o => [o.id, o]));
const byName = new Map(offices.filter(o => o.type === 'recruitment').map(o => [`${o.pref}|${o.name}`, o]));
for (const record of audit.confirmedUpdates) {
  const office = byName.get(`${record.pref}|${record.name}`);
  if (!office) { errors.push(`Missing confirmed office: ${record.pref}|${record.name}`); continue; }
  for (const field of ['address', 'tel', 'url', 'area']) {
    if (!record[field] || office[field] !== record[field]) errors.push(`${office.id}: differs from confirmed ${field}`);
  }
  for (const field of ['lat', 'lng']) {
    if (office[field] !== Math.round(record.coordinates[field] * 1e6) / 1e6) errors.push(`${office.id}: stale ${field}`);
  }
  if (Boolean(office.latApprox) !== record.coordinates.latApprox) errors.push(`${office.id}: coordinate accuracy differs`);
  if (!record.sources?.some(url => /^https:\/\/www\.mod\.go\.jp\/pco\//.test(url))) errors.push(`${office.id}: missing official provenance`);
}
for (const removal of audit.removed) {
  if (byId.has(removal.id)) errors.push(`Unlisted office reintroduced: ${removal.id}`);
}
const count = [...recruitment.values()].reduce((total, names) => total + names.size, 0);
if (count !== audit.draftRecruitmentCount) errors.push(`Total count differs: ${count}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Office inventory OK: ${count} recruitment offices, ${headquarters.size} PCOs; ${audit.confirmedUpdates.length} confirmed records checked.`);
  console.log(`Official audit remains incomplete: ${audit.pending.length} records pending; this check does not authorize merging.`);
  console.log(`Pre-existing missing addresses retained: ${legacyMissingAddresses.size}.`);
}
