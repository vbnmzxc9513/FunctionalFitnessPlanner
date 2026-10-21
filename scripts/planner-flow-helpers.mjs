import assert from 'node:assert/strict';
import { closeExerciseDetails } from './exercise-details-helpers.mjs';

/** Leave the immersive automatic-planning flow through its visible back action. */
export async function closePlanningFlow(page) {
  const navVisible = () => page.evaluate(() => [...document.querySelectorAll('.app-nav button')]
    .some(button => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden'));
  if (await navVisible()) return false;
  const back = await page.$('[data-testid="period-workspace"] .period-flow-back');
  if (!back || !await back.isVisible()) { await back?.dispose(); return false; }
  await back.dispose();
  await closeExerciseDetails(page);
  const factsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1') || 'null'));
  const action = await page.waitForSelector('[data-testid="period-workspace"] .period-flow-back', { visible: true });
  await page.waitForFunction(button => !button.disabled, {}, action);
  await action.evaluate(button => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await action.click(); await action.dispose();
  await page.waitForFunction(() => [...document.querySelectorAll('.app-nav button')]
    .some(button => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden'));
  assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1') || 'null')), factsBefore,
    'Leaving an unapplied planning flow preserves applied sessions and actual records');
  return true;
}
