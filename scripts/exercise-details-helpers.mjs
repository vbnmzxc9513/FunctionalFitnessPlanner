export async function closeExerciseDetails(page) {
  const button = await page.$('dialog[open] [data-detail-close]');
  if (!button) return;
  await button.asLocator().click(); await button.dispose();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
}
export async function openExerciseDetails(page, id) {
  await closeExerciseDetails(page);
  const selector = `[data-testid="daily-exercise-list"] [data-testid="exercise-open-${id}"]`;
  const button = await page.waitForSelector(selector, { visible: true });
  await button.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await button.asLocator().click(); await button.dispose();
  await page.waitForSelector(`dialog[open] [data-testid="current-exercise"]`, { visible: true });
}
