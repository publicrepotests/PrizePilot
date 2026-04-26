const buckets = new Map();

function nowMs() {
  return Date.now();
}

function compactBucket(bucket, windowMs) {
  const cutoff = nowMs() - windowMs;
  while (bucket.length && bucket[0] < cutoff) {
    bucket.shift();
  }
}

export function checkRateLimit(key, { limit, windowMs }) {
  const currentKey = String(key || "anonymous");
  const bucket = buckets.get(currentKey) || [];

  compactBucket(bucket, windowMs);
  if (bucket.length >= limit) {
    const retryAfterMs = windowMs - (nowMs() - bucket[0]);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  bucket.push(nowMs());
  buckets.set(currentKey, bucket);
  return { allowed: true, retryAfterSec: 0 };
}
