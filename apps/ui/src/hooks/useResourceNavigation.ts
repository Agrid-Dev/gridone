import {
  useLocation,
  useNavigate,
  type To,
  type NavigateOptions,
  createPath,
  resolvePath,
} from "react-router";
import { useTranslation } from "react-i18next";
import {
  currentEntry,
  locationUrl,
  navigationStore,
  resourcePath,
  saveEntry,
  validOrigin,
  type ReturnOrigin,
} from "@/lib/navigation";
import { captureNavigationEntry } from "@/lib/navigationRestoration";

/** Context belongs to a resource visit, so tabs and edit pages keep the same return destination. */
export function useResourceNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const entry = currentEntry(location);

  const prepare = (to: To) => {
    const entry = currentEntry(location);
    const resolved = resolvePath(to, location.pathname);
    const url = createPath(resolved);
    const sameResource =
      resourcePath(url) &&
      resourcePath(url) === resourcePath(locationUrl(location));
    const context = sameResource
      ? entry.context
      : {
          visit: crypto.randomUUID(),
          origin: {
            url: locationUrl(location),
            name:
              document.querySelector<HTMLElement>("[data-navigation-title]")
                ?.dataset.navigationTitle ||
              document
                .querySelector("[data-page-title]")
                ?.textContent?.trim() ||
              document.title,
            named: !!resourcePath(location.pathname),
            key: location.key,
            index: entry.index,
            context: entry.context,
          } satisfies ReturnOrigin,
        };
    // An explicit query always wins; bare tab links restore only this visit's settings.
    if (sameResource && !resolved.search)
      resolved.search =
        navigationStore.tabs[context.visit]?.[resolved.pathname] ?? "";
    return {
      to: resolved,
      state: { resourceNavigation: context },
    };
  };

  const capture = () =>
    saveEntry(location, captureNavigationEntry(currentEntry(location)));

  const open = (
    to: To,
    options?: NavigateOptions & { originPageTitle?: boolean },
  ) => {
    capture();
    const next = prepare(to);
    if (options?.originPageTitle && next.state.resourceNavigation.origin)
      next.state.resourceNavigation.origin.pageTitle = true;
    navigate(next.to, {
      ...options,
      state: { ...next.state, ...options?.state },
    });
  };

  const origin = validOrigin(entry.context.origin, locationUrl(location));
  const back = (fallback: To) => {
    capture();
    const entry = currentEntry(location);
    const destination = validOrigin(
      entry.context.origin,
      locationUrl(location),
    );
    if (destination && navigationStore.entries[destination.key])
      navigationStore.entries[destination.key].values.returning = true;
    if (
      destination &&
      navigationStore.history[destination.index] === destination.key &&
      destination.index < entry.index
    ) {
      navigate(destination.index - entry.index);
    } else {
      navigate(destination?.url ?? fallback, {
        replace: true,
        state: destination
          ? {
              resourceNavigation: destination.context,
              resumeEntry: destination.key,
            }
          : null,
      });
    }
  };

  const lists = {
    "/devices": "devices",
    "/assets": "assets",
    "/faults": "faults",
    "/transports": "transports",
    "/drivers": "drivers",
    "/automations": "automations",
    "/devices/views": "views",
    "/devices/commands": "commands",
    "/devices/commands/new": "commands",
  } as const;
  const list =
    origin && lists[origin.url.split(/[?#]/)[0] as keyof typeof lists];
  const backLabel = origin
    ? origin.pageTitle
      ? t("navigation.backToPage", { name: origin.name })
      : list
        ? t(`navigation.back.${list}`)
        : t(
            origin.named
              ? "navigation.backToResource"
              : "navigation.backToPage",
            { name: origin.name },
          )
    : null;
  return { prepare, capture, open, back, origin, backLabel };
}
