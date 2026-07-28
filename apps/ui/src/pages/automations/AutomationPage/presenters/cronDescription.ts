import cronstrue from "cronstrue";
import "cronstrue/locales/fr";

/**
 * Render a valid cron expression as a complete sentence. cRonstrue handles
 * advanced cron syntax too, so legacy schedules remain understandable even
 * when they cannot be represented by the common-pattern picker.
 */
export function describeCronExpression(
  cron: string,
  language?: string,
): string | null {
  if (!cron.trim()) return null;

  const locale = language?.toLowerCase().startsWith("fr") ? "fr" : "en";

  try {
    return cronstrue.toString(cron, {
      locale,
      throwExceptionOnParseError: true,
      use24HourTimeFormat: locale === "fr",
      verbose: true,
    });
  } catch {
    return null;
  }
}
