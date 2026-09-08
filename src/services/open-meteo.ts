import {
  arrowLengthKm,
  classifyWind,
  compassDirection,
  createDownwindSector,
  windToDirection,
} from '../domain/wind'
import type { Volcano, WindObservation } from '../domain/types'

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

interface WindFetchOptions {
  fetcher?: typeof fetch
  now?: Date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export async function fetchOpenMeteoWind(
  volcano: Volcano,
  options: WindFetchOptions = {},
): Promise<WindObservation> {
  const now = options.now ?? new Date()
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('now must be a valid date')
  }

  const url = new URL(OPEN_METEO_URL)
  url.search = new URLSearchParams({
    latitude: String(volcano.latitude),
    longitude: String(volcano.longitude),
    hourly: 'wind_speed_850hPa,wind_direction_850hPa',
    wind_speed_unit: 'ms',
    timeformat: 'iso8601',
    timezone: 'UTC',
    past_days: '1',
    forecast_days: '1',
  }).toString()

  const fetcher = options.fetcher ?? globalThis.fetch
  let response: Response

  try {
    response = await fetcher(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown network error'
    throw new Error(`Open-Meteo request failed: ${message}`)
  }

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Open-Meteo response was not valid JSON')
  }

  const hourly = isRecord(payload) && isRecord(payload.hourly) ? payload.hourly : null
  const times = hourly?.time
  const speeds = hourly?.wind_speed_850hPa
  const directions = hourly?.wind_direction_850hPa

  if (!isStringArray(times) || !isArray(speeds) || !isArray(directions)) {
    throw new Error('Open-Meteo response contains incomplete hourly wind data')
  }

  if (times.length === 0 || times.length !== speeds.length || times.length !== directions.length) {
    throw new Error('Open-Meteo response contains incomplete hourly wind data')
  }

  const timestamps = times.map((time) => Date.parse(time))
  if (timestamps.some((timestamp) => Number.isNaN(timestamp))) {
    throw new Error('Open-Meteo response contains an invalid hourly timestamp')
  }

  const nowMs = now.getTime()
  const nearestIndex = timestamps.reduce((closestIndex, timestamp, index) => {
    const closestDistance = Math.abs(timestamps[closestIndex] - nowMs)
    const distance = Math.abs(timestamp - nowMs)
    return distance < closestDistance ? index : closestIndex
  }, 0)

  const windSpeedMs = speeds[nearestIndex]
  const windFromDirectionDeg = directions[nearestIndex]
  if (
    typeof windSpeedMs !== 'number' ||
    typeof windFromDirectionDeg !== 'number' ||
    !Number.isFinite(windSpeedMs) ||
    windSpeedMs < 0 ||
    !Number.isFinite(windFromDirectionDeg)
  ) {
    throw new Error('Open-Meteo response contains an invalid wind value')
  }

  const windToDirectionDeg = windToDirection(windFromDirectionDeg)
  const warningLevel = classifyWind(windSpeedMs)
  const sectorWidthDeg = 45
  const sectorRadiusKm = 100

  // Build once here so the provider validates the same geometry the map will display.
  createDownwindSector(
    volcano,
    windToDirectionDeg,
    sectorWidthDeg,
    sectorRadiusKm,
  )

  return {
    observedAt: new Date(timestamps[nearestIndex]).toISOString(),
    retrievedAt: now.toISOString(),
    level: '850hPa',
    windSpeedMs,
    windFromDirectionDeg,
    windToDirectionDeg,
    windFromLabel: compassDirection(windFromDirectionDeg),
    windToLabel: compassDirection(windToDirectionDeg),
    warningLevel,
    arrowLengthKm: arrowLengthKm(windSpeedMs),
    sectorWidthDeg,
    sectorRadiusKm,
    provider: 'Open-Meteo',
  }
}

export type WindProvider = (volcano: Volcano) => Promise<WindObservation>

export function createOpenMeteoProvider(fetcher: typeof fetch = globalThis.fetch): WindProvider {
  return (volcano) => fetchOpenMeteoWind(volcano, { fetcher })
}
