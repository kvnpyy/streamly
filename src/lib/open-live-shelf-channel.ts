import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
  LIVE_CATEGORY_FLIP_LIMIT,
  orderLiveStreamsForFlip,
} from "@/lib/live-flip-playlist";
import { fetchLiveCategoryChannels } from "@/lib/live-catalog-channels";
import type { LiveShelfMeta } from "@/lib/live-category-shelf";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import type { PlayerPlaylist } from "@/store/player";
import { usePlayer } from "@/store/player";

function previewPlaylist(
  creds: XtreamCredentials,
  shelf: LiveShelfMeta,
  stream: LiveStream
): PlayerPlaylist {
  const preview = shelf.preview.length ? shelf.preview : [stream];
  const ordered = orderLiveStreamsForFlip(preview, stream.stream_id);
  return buildLiveFlipPlaylist(creds, ordered, LIVE_CATEGORY_FLIP_LIMIT);
}

/**
 * Play a shelf tile with category-scoped ↑/↓ — preview first, then full category list.
 */
export function openLiveShelfChannel(
  creds: XtreamCredentials,
  stream: LiveStream,
  shelf: LiveShelfMeta
): void {
  const play = usePlayer.getState().play;
  const source = liveStreamToPlayerSource(creds, stream);
  play(source, { playlist: previewPlaylist(creds, shelf, stream) });

  void fetchLiveCategoryChannels(creds, {
    categoryId: shelf.id,
    limit: LIVE_CATEGORY_FLIP_LIMIT,
  }).then((channels) => {
    upgradeLiveCategoryFlip(creds, stream, channels);
  });
}

/** Flip list from an already-loaded category channel list (See all overlay). */
export function openLiveCategoryChannel(
  creds: XtreamCredentials,
  stream: LiveStream,
  channels: LiveStream[]
): void {
  const list = channels.length ? channels : [stream];
  const play = usePlayer.getState().play;
  const ordered = orderLiveStreamsForFlip(list, stream.stream_id);
  play(liveStreamToPlayerSource(creds, stream), {
    playlist: buildLiveFlipPlaylist(creds, ordered, LIVE_CATEGORY_FLIP_LIMIT),
  });
}

function upgradeLiveCategoryFlip(
  creds: XtreamCredentials,
  stream: LiveStream,
  channels: LiveStream[]
): void {
  if (!channels.length) return;
  const current = usePlayer.getState().current;
  if (current?.kind !== "live" || current.id !== stream.stream_id) return;
  const play = usePlayer.getState().play;
  const ordered = orderLiveStreamsForFlip(channels, stream.stream_id);
  play(liveStreamToPlayerSource(creds, stream), {
    playlist: buildLiveFlipPlaylist(creds, ordered, LIVE_CATEGORY_FLIP_LIMIT),
  });
}
