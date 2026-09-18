import { internalUrl } from "./navigation";

const KEY = "gridone.loginReturn";
let pending: string | null = null;
let voluntaryLogout = false;

export function rememberLoginReturn(url: string) {
  if (voluntaryLogout) return;
  const safe = internalUrl(url);
  if (!safe || safe.split(/[?#]/)[0] === "/login") return;
  pending = safe;
  try {
    sessionStorage.setItem(KEY, safe);
  } catch {
    /* Memory fallback. */
  }
}

export function consumeLoginReturn(): string {
  voluntaryLogout = false;
  let value = pending;
  try {
    value = sessionStorage.getItem(KEY) ?? value;
    sessionStorage.removeItem(KEY);
  } catch {
    /* Memory fallback. */
  }
  pending = null;
  const safe = internalUrl(value);
  return safe && safe.split(/[?#]/)[0] !== "/login" ? safe : "/";
}

export function clearLoginReturn() {
  pending = null;
  voluntaryLogout = true;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Storage is optional. */
  }
}
