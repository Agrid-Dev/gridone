import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

export function useMobileNavigation() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const previousKey = useRef(location.key);
  const navigated = useRef(false);
  useEffect(() => {
    if (previousKey.current !== location.key) {
      previousKey.current = location.key;
      if (open) {
        navigated.current = true;
        setOpen(false);
      }
    }
  }, [location.key, open]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (media.matches) {
        navigated.current = true;
        setOpen(false);
      }
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  const onCloseAutoFocus = (event: Event) => {
    if (navigated.current) {
      event.preventDefault();
      navigated.current = false;
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  };
  const onNavigate = () => {
    navigated.current = true;
    setOpen(false);
  };
  return { open, setOpen, onNavigate, onCloseAutoFocus };
}
