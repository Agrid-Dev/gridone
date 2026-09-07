import { describe, expect, it } from "vitest";
import {
  hasOverlap,
  isOvernightWindow,
  resolveDefaultWindow,
  windowsOverlap,
  type HotelDefaults,
} from "./weeklyScheduleWindows";

describe("windowsOverlap", () => {
  it("flags two overnight windows that overlap after wraparound", () => {
    expect(windowsOverlap(["22:00", "08:00"], ["23:00", "07:00"])).toBe(true);
  });

  it("does not flag two overnight windows that don't overlap", () => {
    expect(windowsOverlap(["22:00", "23:00"], ["23:30", "06:00"])).toBe(false);
  });

  it("treats equal start/end as touching, not overlapping", () => {
    expect(windowsOverlap(["22:00", "23:00"], ["23:00", "06:00"])).toBe(false);
  });

  it("has no notion of which day each window belongs to", () => {
    // A Monday 22:00-07:00 window normalizes into Tuesday morning and truly
    // collides with a Tuesday 06:00-08:00 window, but this function treats
    // both spans as anchored to the same reference day, so it reports no
    // overlap. Callers only ever compare windows within a single day
    // (`hasOverlap` is called once per day in the widget), so this
    // cross-day collision is never actually checked anywhere — a known gap,
    // not a bug in this function.
    expect(windowsOverlap(["22:00", "07:00"], ["06:00", "08:00"])).toBe(false);
  });
});

describe("hasOverlap", () => {
  it("flags a set with any overlapping pair", () => {
    expect(
      hasOverlap([
        ["22:00", "08:00"],
        ["23:00", "07:00"],
      ]),
    ).toBe(true);
  });

  it("does not flag a set with no overlapping pair", () => {
    expect(
      hasOverlap([
        ["22:00", "23:00"],
        ["23:30", "06:00"],
      ]),
    ).toBe(false);
  });
});

describe("isOvernightWindow", () => {
  it("accepts a checkout earlier than checkin", () => {
    expect(isOvernightWindow("22:00", "07:00")).toBe(true);
  });

  it("rejects a checkout at or after checkin", () => {
    expect(isOvernightWindow("12:00", "14:00")).toBe(false);
    expect(isOvernightWindow("12:00", "12:00")).toBe(false);
  });
});

describe("resolveDefaultWindow", () => {
  const hotel: HotelDefaults = {
    checkin: "15:00",
    checkout: "12:00",
    weekendCheckin: "16:00",
    weekendCheckout: "11:00",
  };

  it("falls back to the hotel-wide value with no override", () => {
    expect(resolveDefaultWindow("monday", hotel, undefined)).toEqual({
      checkin: "15:00",
      checkout: "12:00",
    });
  });

  it("uses the hotel-wide weekend value on a weekend day", () => {
    expect(resolveDefaultWindow("saturday", hotel, undefined)).toEqual({
      checkin: "16:00",
      checkout: "11:00",
    });
  });

  it("prefers the room's override over the hotel-wide value on a weekday", () => {
    const override = { checkin_time: "18:00", checkout_time: "09:00" };
    expect(resolveDefaultWindow("monday", hotel, override)).toEqual({
      checkin: "18:00",
      checkout: "09:00",
    });
  });

  it("does not extend a weekday override to the weekend: falls back to the hotel-wide weekend value", () => {
    // Each field resolves independently: overriding checkin_time/checkout_time
    // alone says nothing about weekend_checkin_time/weekend_checkout_time.
    const override = { checkin_time: "18:00", checkout_time: "09:00" };
    expect(resolveDefaultWindow("saturday", hotel, override)).toEqual({
      checkin: "16:00",
      checkout: "11:00",
    });
  });

  it("prefers the room's own weekend override over the hotel-wide weekend value", () => {
    const override = {
      weekend_checkin_time: "17:00",
      weekend_checkout_time: "10:00",
    };
    expect(resolveDefaultWindow("sunday", hotel, override)).toEqual({
      checkin: "17:00",
      checkout: "10:00",
    });
  });

  it("returns undefined when neither the override nor the hotel declares a value", () => {
    const noHotel: HotelDefaults = { checkin: undefined, checkout: undefined };
    expect(resolveDefaultWindow("monday", noHotel, undefined)).toBeUndefined();
  });

  it("returns undefined when only one side (checkin or checkout) is resolvable", () => {
    const partialHotel: HotelDefaults = {
      checkin: "15:00",
      checkout: undefined,
    };
    expect(
      resolveDefaultWindow("monday", partialHotel, undefined),
    ).toBeUndefined();
  });
});
