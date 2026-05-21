// Backup recommender — picks the safest backup to restore from a list.
//
// Rules (in order):
//   1. Reject empty backups (richness === 0) unless the entire list is
//      empty, in which case there's nothing to recommend.
//   2. Among the remaining, prefer the highest richness score.
//   3. Tie on richness → prefer the freshest (highest capturedAt).
//
// Pure compute — no side effects.

export type BackupRow = {
  capturedAt: number;
  reason: string;
  richness: number;
};

export function recommendBackup<T extends BackupRow>(
  backups: T[],
): T | null {
  if (backups.length === 0) return null;
  const nonEmpty = backups.filter((b) => b.richness > 0);
  if (nonEmpty.length === 0) return null;
  let best = nonEmpty[0];
  for (const b of nonEmpty) {
    if (b.richness > best.richness) {
      best = b;
      continue;
    }
    if (b.richness === best.richness && b.capturedAt > best.capturedAt) {
      best = b;
    }
  }
  return best;
}
