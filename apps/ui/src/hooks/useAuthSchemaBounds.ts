import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { getAuthSchema } from "@/lib/authSchema";

type Bounds = { min: number; max: number };

/** Fallbacks mirror users.validation; used only until the schema resolves. */
const USERNAME_FALLBACK: Bounds = { min: 3, max: 64 };
const PASSWORD_FALLBACK: Bounds = { min: 5, max: 72 };

/** Username and password bounds from `GET /auth/schema`, shared across callers. */
export function useAuthSchemaBounds(): {
  username: Bounds;
  password: Bounds;
} {
  const client = useGridoneClient();
  const { data } = useQuery({
    queryKey: ["auth-schema"],
    queryFn: () => getAuthSchema(client),
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    const props = data?.properties;
    return {
      username: {
        min: props?.username?.minLength ?? USERNAME_FALLBACK.min,
        max: props?.username?.maxLength ?? USERNAME_FALLBACK.max,
      },
      password: {
        min: props?.password?.minLength ?? PASSWORD_FALLBACK.min,
        max: props?.password?.maxLength ?? PASSWORD_FALLBACK.max,
      },
    };
  }, [data]);
}
