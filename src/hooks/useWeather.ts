import { useCallback, useEffect, useState } from 'react';
import { fetchWeather } from '../lib/weather.ts';
import type { Weather } from '../types.ts';

export type WeatherState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; weather: Weather | null };

/**
 * Henter vær for et punkt (null = ikke noe sted valgt ennå), avbryter hvis stedet endres.
 * Oppdateres automatisk hvert 15. minutt, og `retry` henter på nytt.
 */
export function useWeather(
  lat: number | null,
  lng: number | null
): WeatherState & { retry: () => void } {
  const [state, setState] = useState<WeatherState>({ status: lat === null ? 'idle' : 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (lat === null || lng === null) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    void fetchWeather(lat, lng, controller.signal).then((weather) => {
      if (!controller.signal.aborted) setState({ status: 'ready', weather });
    });
    const tm = window.setInterval(() => setTick((n) => n + 1), 15 * 60_000);
    return () => {
      controller.abort();
      window.clearInterval(tm);
    };
  }, [lat, lng, tick]);
  const retry = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, retry };
}
