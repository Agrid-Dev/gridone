import type { KeyboardEvent } from "react";

/** Arrow navigation skips unavailable choices; Tab still exposes their reasons. */
export function moveRadioFocus(event: KeyboardEvent<HTMLButtonElement>) {
  if (
    ![
      "ArrowRight",
      "ArrowDown",
      "ArrowLeft",
      "ArrowUp",
      "Home",
      "End",
    ].includes(event.key)
  )
    return;
  const options = Array.from(
    event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
  ).filter((option) => option.getAttribute("aria-disabled") !== "true");
  if (!options.length) return;
  event.preventDefault();
  const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : (options.indexOf(event.currentTarget) + direction + options.length) %
          options.length;
  options[index].focus();
  options[index].click();
}
