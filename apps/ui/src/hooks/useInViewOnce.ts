import { useEffect, useState } from "react";

/** `IntersectionObserverInit` is a type-only DOM global, which the lint
 *  config's browser globals do not declare; derive it from the constructor. */
type ObserverOptions = ConstructorParameters<typeof IntersectionObserver>[1];

/**
 * Whether an element has entered the viewport at least once.
 *
 * Latching on the first intersection (rather than tracking visibility) is what
 * makes it usable as a fetch gate: work started when a card scrolled into view
 * must not be torn down when it scrolls back out. Environments without
 * `IntersectionObserver` report "in view" immediately, so the gate degrades to
 * rendering everything rather than to rendering nothing.
 *
 * The observed node is held in state, not in a ref: the observer is then set
 * up by an effect, which React re-runs after the mount it simulates in strict
 * mode. Observing from the ref callback instead leaves the observer
 * disconnected by that simulated unmount, and it never fires again.
 *
 * Returns the ref callback to attach to the observed element.
 */
export function useInViewOnce<T extends Element>(
  options?: ObserverOptions,
): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (inView || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setInView(true);
    }, options);
    observer.observe(node);
    return () => observer.disconnect();
    // `options` is deliberately not a dependency: it is an inline literal at
    // every call site, so keying on its identity would tear the observer down
    // and rebuild it on every render.
  }, [node, inView]);

  return [setNode, inView];
}
