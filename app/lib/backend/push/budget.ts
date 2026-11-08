/** A client-side deadline is required even when a gateway ignores cancellation. */
export async function withinBudget<T>(operation: (signal: AbortSignal) => PromiseLike<T>, milliseconds: number): Promise<T> {
  if (milliseconds <= 0) throw new Error('push deadline');
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error('push deadline')); }, milliseconds);
      }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
}
