/** User-facing label for saved titles (Netflix-style “My List”). */
export const MY_LIST_LABEL = "My List";

export const MY_LIST_EVENT = "streamly-my-list-toggle";

export type MyListToggleDetail = { added: boolean };

export function dispatchMyListToggle(added: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<MyListToggleDetail>(MY_LIST_EVENT, {
      detail: { added },
    })
  );
}

export function myListToggleMessage(added: boolean): string {
  return added ? `Added to ${MY_LIST_LABEL}` : `Removed from ${MY_LIST_LABEL}`;
}
