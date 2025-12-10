export const sliderPresets: Record<string, { min: number; max: number; step: number }> = {
  temperature: { min: 12, max: 30, step: 0.5 },
  temperature_setpoint: { min: 12, max: 30, step: 0.5 },
  humidity: { min: 0, max: 100, step: 1 },
  brightness: { min: 0, max: 100, step: 1 },
  wind_speed: { min: 0, max: 100, step: 0.5 },
  fan_speed: { min: 0, max: 6, step: 1 },
};

export function getSliderRange(attributeName: string) {
  return sliderPresets[attributeName] ?? { min: 0, max: 100, step: 1 };
}



