/**
 * iPhone/iPad WebKit does not let script set element volume (hardware volume
 * always wins) and often skips `volumechange` when `muted` is assigned.
 * The muted flag has to be written on the property and the attribute, and the
 * chrome must not treat a stored volume of 0 as "muted" on those devices.
 */

type MuteTarget = {
  muted: boolean;
  defaultMuted: boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

export function applyElementMuted(video: MuteTarget, muted: boolean): void {
  video.defaultMuted = muted;
  video.muted = muted;
  if (muted) video.setAttribute("muted", "");
  else video.removeAttribute("muted");
}

/** Speaker icon. Element volume is meaningless on iOS, so only `muted` counts there. */
export function playerChromeShowsMuted(opts: {
  muted: boolean;
  volume: number;
  volumeControllable: boolean;
}): boolean {
  if (opts.muted) return true;
  if (!opts.volumeControllable) return false;
  return opts.volume <= 0;
}
