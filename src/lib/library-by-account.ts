export type AccountLibrarySlice<F, R> = {
  favorites: F[];
  recents: R[];
  recentDismissedAt: Record<string, number>;
};

export type AccountLibraryState<F, R> = {
  favorites: F[];
  recents: R[];
  recentDismissedAt: Record<string, number>;
  libraryByAccount: Record<string, AccountLibrarySlice<F, R>>;
};

/**
 * Continue Watching and My List belong to one provider login.
 * Switching playlists stashes the current lists and restores the other
 * login's lists, instead of mixing stream ids that do not exist there.
 */
export function swapAccountLibrary<F, R>(
  state: AccountLibraryState<F, R>,
  fromKey: string | null,
  toKey: string
): AccountLibraryState<F, R> {
  const library = { ...state.libraryByAccount };
  if (fromKey && fromKey !== toKey) {
    library[fromKey] = {
      favorites: state.favorites,
      recents: state.recents,
      recentDismissedAt: state.recentDismissedAt,
    };
  }
  if (!fromKey) {
    library[toKey] = {
      favorites: state.favorites,
      recents: state.recents,
      recentDismissedAt: state.recentDismissedAt,
    };
    return { ...state, libraryByAccount: library };
  }
  const saved = library[toKey];
  return {
    favorites: saved?.favorites ?? [],
    recents: saved?.recents ?? [],
    recentDismissedAt: saved?.recentDismissedAt ?? {},
    libraryByAccount: library,
  };
}
