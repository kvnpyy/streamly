"use client";

import { AnimatePresence, motion } from "framer-motion";

export type PlayerSkipIntroButtonProps = {
  visible: boolean;
  label: string;
  onSkip: () => void;
};

/** Netflix-style skip control. Sits above the transport and does not restart playback. */
export function PlayerSkipIntroButton({
  visible,
  label,
  onSkip,
}: PlayerSkipIntroButtonProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="skip-intro"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute bottom-44 sm:bottom-48 left-3 sm:left-6 z-[40] pointer-events-auto"
          data-player-controls=""
          data-binge-overlay=""
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSkip();
            }}
            className="min-h-11 rounded-md border border-white/80 bg-white/95 px-4 sm:px-5 text-sm font-semibold text-black shadow-lg hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={label}
          >
            {label}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
