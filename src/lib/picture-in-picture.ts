/** `HTMLMediaElement.HAVE_METADATA` — safe in SSR/tests without relying on the constant. */
const HAVE_METADATA = 1;

export function isBenignPictureInPictureError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  if (error.name !== "InvalidStateError") return false;
  return /requestPictureInPicture|pictureinpicture/i.test(error.message);
}

const METADATA_WAIT_MS = 12_000;

function waitForVideoMetadata(
  video: HTMLVideoElement,
  timeoutMs: number
): Promise<void> {
  if (video.readyState >= HAVE_METADATA) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("video error before PiP"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("video metadata timeout before PiP"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

export function isPictureInPictureSupported(
  video?: HTMLVideoElement | null
): boolean {
  if (typeof document === "undefined") return false;
  if (document.pictureInPictureEnabled === false) return false;
  return Boolean(video?.requestPictureInPicture);
}

/**
 * Enter PiP only after the video has metadata (avoids InvalidStateError in production).
 * Never throws — returns false when PiP could not be entered.
 */
export async function requestVideoPictureInPicture(
  video: HTMLVideoElement
): Promise<boolean> {
  if (!isPictureInPictureSupported(video)) return false;

  try {
    if (video.readyState < HAVE_METADATA) {
      await waitForVideoMetadata(video, METADATA_WAIT_MS);
    }
    if (video.readyState < HAVE_METADATA) return false;

    if (document.pictureInPictureElement === video) return true;

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    }

    await video.requestPictureInPicture();
    return true;
  } catch {
    return false;
  }
}

export async function exitPictureInPictureSafe(): Promise<void> {
  if (!document.pictureInPictureElement) return;
  try {
    await document.exitPictureInPicture();
  } catch {
    /* already exited */
  }
}

/** Toggle PiP for a player video element; safe for buttons and keyboard shortcuts. */
export async function toggleVideoPictureInPicture(
  video: HTMLVideoElement | null | undefined
): Promise<void> {
  if (!video) return;

  try {
    if (document.pictureInPictureElement) {
      await exitPictureInPictureSafe();
      return;
    }
    await requestVideoPictureInPicture(video);
  } catch {
    /* swallow — callers must not surface unhandled rejections to Sentry */
  }
}
