"use client";

import { useLiveBrowseUi } from "@/store/live-browse-ui";
import { useCallback } from "react";

/** Category overlay id/title shared across Live shelf browse (survives player open). */
export function useLiveOpenCategory() {
  const openCategoryId = useLiveBrowseUi((s) => s.openCategoryId);
  const openCategoryTitle = useLiveBrowseUi((s) => s.openCategoryTitle);
  const openCategoryStore = useLiveBrowseUi((s) => s.openCategory);
  const closeCategoryStore = useLiveBrowseUi((s) => s.closeCategory);

  const openCategory = useCallback(
    (id: string, title: string) => openCategoryStore(id, title),
    [openCategoryStore]
  );

  const closeCategory = useCallback(
    () => closeCategoryStore(),
    [closeCategoryStore]
  );

  return { openCategoryId, openCategoryTitle, openCategory, closeCategory };
}
