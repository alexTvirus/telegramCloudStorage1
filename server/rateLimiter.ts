const buckets = new Map<string, { times: number[] }>();

export const enforceTelegramRateLimit = (
  key: string,
  maxRequests: number,
  windowMs: number,
  minIntervalMs: number
) => {
  const now = Date.now();
  const bucket = buckets.get(key) || { times: [] };

  bucket.times = bucket.times.filter((time) => now - time < windowMs);
  if (bucket.times.length >= maxRequests) {
    throw new Error(
      `Telegram rate limit exceeded for ${key}. Please wait a moment.`
    );
  }

  const last = bucket.times[bucket.times.length - 1] || 0;
  if (now - last < minIntervalMs) {
    throw new Error(
      `Too many Telegram requests too quickly for ${key}. Please wait before retrying.`
    );
  }

  bucket.times.push(now);
  buckets.set(key, bucket);
};