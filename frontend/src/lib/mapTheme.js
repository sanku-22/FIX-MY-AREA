import { useEffect, useState } from "react";
import { isNight } from "@/lib/suncalc";

// Adaptive map theme: ambient light (Android only) -> system dark mode -> sunrise/sunset fallback.
export function useMapTheme(userLocation) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    const compute = (lux) => {
      if (lux != null && !Number.isNaN(lux)) return lux < 12 ? "dark" : "light";
      if (mq && mq.matches) return "dark";
      if (userLocation) return isNight(userLocation[0], userLocation[1]) ? "dark" : "light";
      return "light";
    };

    setTheme(compute(null));

    const onChange = () => setTheme(compute(null));
    if (mq && mq.addEventListener) mq.addEventListener("change", onChange);

    let sensor = null;
    try {
      if ("AmbientLightSensor" in window) {
        // eslint-disable-next-line no-undef
        sensor = new AmbientLightSensor();
        sensor.addEventListener("reading", () => setTheme(compute(sensor.illuminance)));
        sensor.start();
      }
    } catch (e) { /* unsupported (iOS/most browsers) */ }

    const interval = setInterval(() => setTheme(compute(null)), 10 * 60 * 1000);

    return () => {
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onChange);
      if (sensor) { try { sensor.stop(); } catch (e) {} }
      clearInterval(interval);
    };
  }, [userLocation]);

  return theme;
}
