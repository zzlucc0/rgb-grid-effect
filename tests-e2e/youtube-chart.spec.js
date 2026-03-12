import { test, expect } from '@playwright/test';

const URL = 'https://www.youtube.com/watch?v=N9XgnvGaZxk&list=RDN9XgnvGaZxk&start_radio=1';

test('prepared YouTube run generates visible chart/debug progression', async ({ page }) => {
  await page.goto('http://127.0.0.1:8080/index.html');
  await page.locator('#youtubeUrl').fill(URL);
  await page.locator('#analyzeYoutube').click();

  await expect.poll(async () => {
    return await page.locator('#statusText').innerText();
  }, { timeout: 120000 }).toContain('Analysis ready');

  await page.locator('#startGame').click();

  await expect.poll(async () => await page.locator('#debugGameClock').innerText(), { timeout: 30000 })
    .not.toBe('0.00');

  await expect.poll(async () => await page.locator('#debugChartProgress').innerText(), { timeout: 30000 })
    .not.toBe('0/0');

  await expect.poll(async () => await page.locator('#debugActiveNotes').innerText(), { timeout: 30000 })
    .not.toBe('0');

  const diag = await page.locator('#debugDiagState').innerText();
  const playback = await page.locator('#debugPlaybackState').innerText();
  console.log({ diag, playback });
});
