import { useEffect, useRef, type RefObject } from "react";

/**
 * A ref that always holds the latest value of `value` after commit.
 * Use it inside event handlers / subscriptions that must not be re-created on every render.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef<T>(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
