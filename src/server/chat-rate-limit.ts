// Per-process bounds complement the hosting provider's global quota/budget.
// No questions, IP addresses or business facts are retained here.
export function createChatLimiter() {
  const buckets = new Map<string, { count: number; until: number }>();
  let total = { count: 0, until: 0 };
  return (key: string, demo: boolean, now = Date.now()) => {
    if (total.until <= now) total = { count: 0, until: now + 60_000 };
    if (buckets.size >= 2000)
      for (const [id, entry] of buckets)
        if (entry.until <= now) buckets.delete(id);
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (!bucket && buckets.size >= 2000) return false;
      bucket = { count: 0, until: now + 60_000 };
      buckets.set(key, bucket);
    }
    if (bucket.count >= (demo ? 6 : 12) || total.count >= 60) return false;
    bucket.count++;
    total.count++;
    return true;
  };
}

export const allowChatModel = createChatLimiter();
