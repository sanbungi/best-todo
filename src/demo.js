import { seed } from './seed.js';

// Public demo: shared data is wiped and reseeded periodically. Off unless DEMO_MODE=true.
export const demoMode = process.env.DEMO_MODE === 'true';
export const demoLimits = { lists: 50, tasks: 1000 };

function resetMinutes() {
  const minutes = Number(process.env.DEMO_RESET_MINUTES ?? 60);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440)
    throw new Error('DEMO_RESET_MINUTES は1〜1440分で指定してください');
  return minutes;
}

export function resetDemoData(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    // No empty inbox, so visitors land on a seeded list.
    db.exec('DELETE FROM tasks; DELETE FROM lists; DROP TABLE IF EXISTS seeds;');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  // Seeds are relative to today, so each reset brings due dates and dated lists up to date.
  seed(db);
  // Seeds leave sortOrder at 0; the startup migration does the same for normal databases.
  db.exec('UPDATE tasks SET sortOrder=rowid WHERE sortOrder=0');
}

// Resets once at startup, then every DEMO_RESET_MINUTES. Sessions survive resets.
export function startDemo(db) {
  const intervalMs = resetMinutes() * 60 * 1000;
  let nextResetAt = 0;
  const reset = () => {
    resetDemoData(db);
    nextResetAt = Date.now() + intervalMs;
  };
  reset();
  setInterval(() => {
    try {
      reset();
    } catch (error) {
      console.error(error);
    }
  }, intervalMs).unref();
  return () => new Date(nextResetAt).toISOString();
}
