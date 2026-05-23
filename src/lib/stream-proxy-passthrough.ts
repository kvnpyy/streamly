/**
 * Wrap an upstream {@link ReadableStream} so client disconnects and upstream
 * socket resets surface as a normal stream end instead of bubbling as
 * "failed to pipe response" / undici `SocketError` / `terminated` in the route.
 */
export function passthroughStreamWithGracefulClose(
  source: ReadableStream<Uint8Array>,
  clientSignal: AbortSignal
): ReadableStream<Uint8Array> {
  const reader = source.getReader();

  const onClientAbort = () => {
    reader.cancel(new Error("client aborted")).catch(() => {});
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (clientSignal.aborted) {
        reader.cancel(new Error("client aborted")).catch(() => {});
        queueMicrotask(() => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
        return;
      }
      clientSignal.addEventListener("abort", onClientAbort, { once: true });
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          try {
            reader.releaseLock();
          } catch {
            /* already released */
          }
          controller.close();
          return;
        }
        if (value && value.byteLength > 0) {
          controller.enqueue(value);
        }
      } catch {
        try {
          reader.releaseLock();
        } catch {
          /* noop */
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel(reason) {
      clientSignal.removeEventListener("abort", onClientAbort);
      reader.cancel(reason).catch(() => {});
    },
  });
}
