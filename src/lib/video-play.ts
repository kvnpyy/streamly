/** `video.play()` rejected because `pause()` or src teardown ran first (episode/channel switch). */
export function isBenignMediaPlayError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "AbortError"
  ) {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /play\(\) request was interrupted/i.test(message);
}

/** Await `video.play()`; swallow benign AbortError from pause/src changes. */
export async function safeVideoPlay(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch (error) {
    if (isBenignMediaPlayError(error)) return;
    throw error;
  }
}

/** Fire-and-forget `video.play()` with optional handler for real failures (e.g. autoplay policy). */
export function voidSafeVideoPlay(
  video: HTMLVideoElement,
  onRejected?: (error: unknown) => void
): void {
  void video.play().catch((error) => {
    if (isBenignMediaPlayError(error)) return;
    onRejected?.(error);
  });
}
