"use client";

import {
  MY_LIST_EVENT,
  myListToggleMessage,
  type MyListToggleDetail,
} from "@/lib/my-list";
import { useToast } from "@/store/toast";
import { useEffect } from "react";

export function ToastHost() {
  const message = useToast((s) => s.message);
  const show = useToast((s) => s.show);

  useEffect(() => {
    const onMyList = (e: Event) => {
      const detail = (e as CustomEvent<MyListToggleDetail>).detail;
      if (!detail || typeof detail.added !== "boolean") return;
      show(myListToggleMessage(detail.added));
    };
    window.addEventListener(MY_LIST_EVENT, onMyList);
    return () => window.removeEventListener(MY_LIST_EVENT, onMyList);
  }, [show]);

  if (!message) return null;

  return (
    <div
      className="fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] lg:bottom-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-none px-4 w-full max-w-sm"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-xl border border-(--line) bg-(--bg-1)/95 backdrop-blur-md px-4 py-3 text-sm text-(--text) text-center shadow-[0_16px_48px_-12px_rgba(0,0,0,0.65)]">
        {message}
      </div>
    </div>
  );
}
