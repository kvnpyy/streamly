"use client";

import { useLiveBrowseUi } from "@/store/live-browse-ui";
import { useCallback } from "react";

/** Category overlay id shared across Live shelf browse (survives player open). */
export function useLiveOpenCategory() {
  const openCategoryId = useLiveBrowseUi((s) => s.openCategoryId);
  const setOpenCategoryId = useLiveBrowseUi((s) => s.setOpenCategoryId);

  const openCategory = useCallback(
    (id: string) => setOpenCategoryId(id),
    [setOpenCategoryId]
  );

  const closeCategory = useCallback(
    () => setOpenCategoryId(null),
    [setOpenCategoryId]
  );

  return { openCategoryId, openCategory, closeCategory };
}
