// Deploy a small, exact snapshot of the app's reviewed domain code; no credentials/config.
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'shared');
await rm(output, { recursive: true, force: true });
for (const directory of ['domain', 'data']) await mkdir(path.join(output, directory), { recursive: true });
for (const file of ['planning.js', 'coachingPrompt.js', 'exerciseCatalog.js', 'sessions.js', 'training.js', 'dates.js', 'phases.js', 'weeklyBalance.js']) {
  await copyFile(path.join(root, '..', 'src', 'domain', file), path.join(output, 'domain', file));
}
await copyFile(path.join(root, '..', 'src', 'data', 'badmintonExercises.json'), path.join(output, 'data', 'badmintonExercises.json'));
