import type { Device, Driver } from "@gridone/sdk";
import type { Scalar } from "@/components/device-ui/conditions";
import type { AttributeLike } from "@/components/device-ui/runtime";

export type GroupValueState = "common" | "multiple" | "partial" | "unavailable";
export type GroupAttribute = AttributeLike & {
  state: GroupValueState;
  missing: number;
};

/** A value is common only when every member has reported the same scalar. */
export function aggregateGroupAttributes(
  driver: Driver,
  members: Device[],
  memberCount: number,
): Record<string, GroupAttribute> {
  return Object.fromEntries(
    driver.attributes.map((attribute) => {
      const values = members
        .map((member) => member.attributes?.[attribute.name]?.current_value)
        .filter(
          (value): value is Scalar => value !== undefined && value !== null,
        );
      const missing = memberCount - values.length;
      const state: GroupValueState = !values.length
        ? "unavailable"
        : missing > 0
          ? "partial"
          : values.every((value) => value === values[0])
            ? "common"
            : "multiple";
      return [
        attribute.name,
        {
          ...attribute,
          value_options: (members[0]?.attributes?.[attribute.name]
            ?.value_options ?? []) as Scalar[],
          read_write_modes: [
            ...(attribute.read ? ["read"] : []),
            ...(attribute.write ? ["write"] : []),
          ],
          current_value: state === "common" ? values[0] : null,
          state,
          missing,
        },
      ];
    }),
  );
}
