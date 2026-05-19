import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

const DEFAULT_DELAY_MS = 300;

/** Drive a URL query-param from a text input with a debounce.
 *
 *  The input keeps its own local state for snappy typing; the URL — and
 *  therefore any downstream `useSearchParams` consumer — is only updated
 *  after the user stops typing for `delay` ms. Clearing flushes
 *  immediately and resets local state to match.
 *
 *  External URL changes (e.g. clearing all filters from elsewhere) are
 *  reflected back into the local value so the input stays in sync.
 */
export function useDebouncedSearchParam(
  paramKey: string,
  delay: number = DEFAULT_DELAY_MS,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlValue = searchParams.get(paramKey) ?? "";
  const [value, setValue] = useState(urlValue);
  const lastUrlValue = useRef(urlValue);

  const writeToUrl = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set(paramKey, next);
          else params.delete(paramKey);
          return params;
        },
        { replace: true },
      );
    },
    [paramKey, setSearchParams],
  );

  // Pull external URL changes back into local state.
  useEffect(() => {
    if (urlValue !== lastUrlValue.current) {
      lastUrlValue.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);

  // Debounce local edits into the URL.
  useEffect(() => {
    if (value === urlValue) return;
    const handle = setTimeout(() => {
      lastUrlValue.current = value;
      writeToUrl(value);
    }, delay);
    return () => clearTimeout(handle);
  }, [value, urlValue, delay, writeToUrl]);

  const clear = useCallback(() => {
    lastUrlValue.current = "";
    setValue("");
    writeToUrl("");
  }, [writeToUrl]);

  return { value, setValue, clear };
}
