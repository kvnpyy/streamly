"use client";

import { LiveShelfBrowsePage } from "@/components/LiveShelfBrowsePage";
import { LiveGridPageInner } from "@/components/LiveGridPageInner";
import { useLivePageShell } from "@/hooks/use-live-page-shell";
import { useAuth } from "@/store/auth";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { browseAccountKey } from "@/store/preferences";
import { Suspense, useMemo } from "react";

export default function LivePage() {
  const creds = useAuth((s) => s.creds)!;
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
  return (
    <Suspense
      fallback={
        <div className="text-(--text-muted) text-sm py-8">Loading Live TV…</div>
      }
    >
      <LivePageInner key={accountKey} creds={creds} accountKey={accountKey} />
    </Suspense>
  );
}

function LivePageInner({
  creds,
  accountKey,
}: {
  creds: XtreamCredentials;
  accountKey: string;
}) {
  const shell = useLivePageShell(creds, accountKey);

  if (shell.shelfBrowseActive) {
    return (
      <LiveShelfBrowsePage
        creds={shell.creds}
        accountKey={accountKey}
        catalog={shell.catalog}
        sortedFilteredCats={shell.sortedFilteredCats}
        countById={shell.countById}
        categoryNameById={shell.categoryNameById}
        selected={shell.selected}
        setCategory={shell.setCategory}
        view={shell.view}
        setViewMode={shell.setViewMode}
        viewSwitchPending={shell.viewSwitchPending}
        q={shell.q}
        setQ={shell.setQ}
        clearLiveSearch={shell.clearLiveSearch}
        deferredQLower={shell.deferredQLower}
        tvLivingRoom={shell.tvLivingRoom}
        liveSearchRef={shell.liveSearchRef}
      />
    );
  }

  return <LiveGridPageInner shell={shell} />;
}
