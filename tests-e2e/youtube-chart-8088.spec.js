import { test, expect } from '@playwright/test';

const URL = 'https://www.youtube.com/watch?v=N9XgnvGaZxk&list=RDN9XgnvGaZxk&start_radio=1';

test('8088 deployment generates chart notes for prepared YouTube run', async ({ page }) => {
  await page.goto('http://z2one:8088/');
  await page.locator('#youtubeUrl').fill(URL);
  await page.locator('#analyzeYoutube').click();

  await expect.poll(async () => {
    return await page.locator('#statusText').innerText();
  }, { timeout: 120000 }).toContain('Analysis ready');

  await page.locator('#startGame').click();

  await expect.poll(async () => await page.locator('#debugGameClock').innerText(), { timeout: 30000 })
    .not.toBe('0.00');

  await expect.poll(async () => await page.locator('#debugActiveNotes').innerText(), { timeout: 30000 })
    .not.toBe('0');

  const values = {
    clock: await page.locator('#debugGameClock').innerText(),
    player: await page.locator('#debugPlayerClock').innerText(),
    chart: await page.locator('#debugChartProgress').innerText(),
    notes: await page.locator('#debugActiveNotes').innerText(),
    playback: await page.locator('#debugPlaybackState').innerText(),
    diag: await page.locator('#debugDiagState').innerText(),
  };
  console.log(values);
});
