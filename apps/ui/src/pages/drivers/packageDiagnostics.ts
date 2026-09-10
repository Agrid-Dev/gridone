import { isGridoneError } from "@gridone/sdk";
import { z } from "zod";

const diagnosticSchema = z.object({
  code: z.string(),
  path: z.string().nullish(),
  line: z.number().int().positive().nullish(),
  column: z.number().int().positive().nullish(),
  message: z.string(),
});

export type PackageDiagnostic = z.infer<typeof diagnosticSchema>;

/** Only structured import diagnostics from a 422 response are displayable. */
export function packageDiagnostics(error: unknown): PackageDiagnostic[] {
  if (!isGridoneError(error) || error.status !== 422) return [];
  const parsed = z.array(diagnosticSchema).safeParse(error.rawDetail);
  return parsed.success ? parsed.data : [];
}
