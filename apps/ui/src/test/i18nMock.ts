/**
 * Reusable factory for mocking react-i18next in vitest specs.
 *
 * Usage:
 *
 *   import { createI18nMock } from "@/test/i18nMock";
 *
 *   vi.mock("react-i18next", () =>
 *     createI18nMock({
 *       "triggers.operator": "Operator",
 *       "triggers.threshold": "Threshold",
 *       "common.timeAgo.minutes": "{{count}} minutes",
 *       "common.faults.activeSince": "Active since {{ago}}",
 *     }),
 *   );
 *
 * Behaviour:
 *  - Exact-key lookup against the supplied map.
 *  - `{{name}}` placeholders inside template strings are substituted from the
 *    `t(..., opts)` second argument (e.g. `{{count}}`, `{{ago}}`).
 *  - When the key is absent, falls back to `opts.defaultValue` (i18next
 *    convention) and finally to the raw key — matching real-i18next's
 *    behaviour with `returnEmptyString: false`.
 *  - Exposes an `i18n` object for components that read `i18n.language` (e.g.
 *    locale-aware `Intl` formatters). Pass `language` to override it.
 *
 * Note: lookup is exact — there is no plural resolution. Register the base key
 * (`"sidebar.faultsBadge"`), not `_one` / `_other`.
 */
export function createI18nMock(
  translations: Record<string, string>,
  { language = "fr" }: { language?: string } = {},
) {
  const i18n = { language, resolvedLanguage: language };
  return {
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        const template = translations[key];
        if (template !== undefined) return interpolate(template, opts);
        if (opts && typeof opts.defaultValue === "string") {
          return opts.defaultValue;
        }
        return key;
      },
      i18n,
    }),
  };
}

function interpolate(template: string, opts?: Record<string, unknown>): string {
  if (!opts) return template;
  return template.replace(/{{(\w+)}}/g, (_, name) =>
    name in opts ? String(opts[name]) : "",
  );
}
