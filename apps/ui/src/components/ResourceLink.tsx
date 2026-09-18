import { forwardRef } from "react";
import {
  Link,
  NavLink,
  useResolvedPath,
  type LinkProps,
  type NavLinkProps,
} from "react-router";
import { useResourceNavigation } from "@/hooks/useResourceNavigation";
import { navigationStore, resourcePath } from "@/lib/navigation";
import { useTranslation } from "react-i18next";

/** A real link: modified clicks keep native browser behavior and a fresh tab has no origin. */
export const ResourceLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function ResourceLink({ to, state, onClick, ...props }, ref) {
    const { prepare, open } = useResourceNavigation();
    const resolved = useResolvedPath(to, { relative: props.relative });
    const { t } = useTranslation("devices");
    const resource = resourcePath(resolved.pathname);
    const next = prepare(resolved);
    if (
      resource?.startsWith("/devices/") &&
      resource.split("/")[2] !== "views" &&
      navigationStore.deleted.includes(resource)
    )
      return (
        <span className="text-muted-foreground">
          {t("deleted")} · {resource.split("/").at(-1)}
        </span>
      );
    return (
      <Link
        {...props}
        ref={ref}
        to={next.to}
        state={{ ...next.state, ...state }}
        onClick={(event) => {
          onClick?.(event);
          if (
            !event.defaultPrevented &&
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey &&
            (!props.target || props.target === "_self") &&
            !props.reloadDocument
          ) {
            event.preventDefault();
            open(resolved, { replace: props.replace, state });
          }
        }}
      />
    );
  },
);

export const ResourceNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function ResourceNavLink({ to, state, onClick, ...props }, ref) {
    const { prepare, open } = useResourceNavigation();
    const resolved = useResolvedPath(to, { relative: props.relative });
    const next = prepare(resolved);
    return (
      <NavLink
        {...props}
        ref={ref}
        to={next.to}
        state={{ ...next.state, ...state }}
        onClick={(event) => {
          onClick?.(event);
          if (
            !event.defaultPrevented &&
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey &&
            (!props.target || props.target === "_self") &&
            !props.reloadDocument
          ) {
            event.preventDefault();
            open(resolved, { replace: props.replace, state });
          }
        }}
      />
    );
  },
);
