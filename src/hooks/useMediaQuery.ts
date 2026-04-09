import { useSyncExternalStore } from "react";

function subscribe(mq: MediaQueryList, onChange: () => void) {
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof globalThis.matchMedia === "undefined") return () => {};
      const mq = globalThis.matchMedia(query);
      return subscribe(mq, cb);
    },
    () => {
      if (typeof globalThis.matchMedia === "undefined") return false;
      return globalThis.matchMedia(query).matches;
    },
    () => false,
  );
}
