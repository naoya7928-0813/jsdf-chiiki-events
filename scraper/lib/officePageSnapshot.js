'use strict';

function decodeHtml(buffer, headers = {}) {
  const ascii = Buffer.from(buffer).toString('latin1');
  const charset = String(headers['content-type'] || '').match(/charset\s*=\s*([\w-]+)/i)?.[1]
    || ascii.slice(0, 5000).match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(buffer); }
  catch { return new TextDecoder('utf-8').decode(buffer); }
}

// Recover HTML already received by the browser when scripts navigate during
// page.content(), or resources delay load. Never issue an extra HTTP request.
async function readOfficeSnapshot(page, url) {
  let response = null;
  page.on?.('response', candidate => {
    const req = candidate.request();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) response = candidate;
  });
  let navigationError = null;
  try { response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }) || response; }
  catch (error) { navigationError = error; }
  if (!response) throw navigationError || Error('No document response');
  const status = response.status();
  let html;
  try { html = await page.content(); }
  catch (error) {
    if (!response.body) throw error;
    html = decodeHtml(await response.body(), response.headers?.() || {});
  }
  const finalUrl = response.url?.() || page.url();
  return { html, status, finalUrl };
}
module.exports = { readOfficeSnapshot, decodeHtml };
