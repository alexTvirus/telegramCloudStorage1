import crypto from "crypto";

interface TelegramQueueState {
  tail: Promise<void>;
  nextAllowedAt: number;
}

const queues = new Map<string, TelegramQueueState>();
const MIN_TELEGRAM_REQUEST_INTERVAL_MS = 1000;
const MAX_RATE_LIMIT_RETRIES = 3;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const getRetryAfterMs = (error: any): number | undefined => {
  const retryAfter =
    error?.response?.body?.parameters?.retry_after ??
    error?.response?.body?.parameters?.retryAfter;
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

/**
 * Serialize Telegram requests per bot token, leave a conservative gap between
 * requests, and honor Telegram's retry_after response when it rate-limits us.
 */
export const runTelegramRequest = async <T>(
  token: string,
  operation: () => Promise<T>
): Promise<T> => {
  const key = crypto.createHash("sha256").update(token).digest("hex");
  let state = queues.get(key);
  if (!state) {
    state = { tail: Promise.resolve(), nextAllowedAt: 0 };
    queues.set(key, state);
  }

  const currentState = state;
  const result = currentState.tail.then(async () => {
    let retries = 0;
    while (true) {
      const waitMs = currentState.nextAllowedAt - Date.now();
      if (waitMs > 0) await sleep(waitMs);

      try {
        const value = await operation();
        currentState.nextAllowedAt = Date.now() + MIN_TELEGRAM_REQUEST_INTERVAL_MS;
        return value;
      } catch (error) {
        const retryAfterMs = getRetryAfterMs(error);
        if (retryAfterMs === undefined || retries >= MAX_RATE_LIMIT_RETRIES) {
          currentState.nextAllowedAt =
            Date.now() + MIN_TELEGRAM_REQUEST_INTERVAL_MS;
          throw error;
        }

        retries += 1;
        currentState.nextAllowedAt = Date.now() + retryAfterMs + 250;
      }
    }
  });

  currentState.tail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};
