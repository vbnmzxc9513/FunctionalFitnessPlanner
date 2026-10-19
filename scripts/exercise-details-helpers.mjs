export async function closeExerciseDetails(page) {
  const button = await page.$('dialog[open] [data-detail-close]');
  if (!button) return;
  await button.dispose();
  await page.locator('dialog[open] [data-detail-close]').click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
}
export async function openExerciseDetails(page, id) {
  await closeExerciseDetails(page);
  const selector = `[data-testid="daily-exercise-list"] [data-testid="exercise-open-${id}"]`;
  // Restore can replace the row between lookup and click; resolve it afresh on retries.
  await page.locator(selector).map(item => {
    item.scrollIntoView({ block: 'center', behavior: 'instant' });
    return item;
  }).click();
  await page.waitForSelector(`dialog[open] [data-testid="current-exercise"]`, { visible: true });
}
