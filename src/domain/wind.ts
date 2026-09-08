import type { Coordinates, GeoJsonSector, WindWarningLevel } from './types'

const EARTH_RADIUS_KM = 6371
const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function assertFinite(value: number, name: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`)
  }
}

function assertNonNegative(value: number, name: string) {
  assertFinite(value, name)
  if (value < 0) {
    throw new RangeError(`${name} must be non-negative`)
  }
}

function normalizeDegrees(degrees: number) {
  assertFinite(degrees, 'degrees')
  return ((degrees % 360) + 360) % 360
}

export function windToDirection(windFromDirectionDeg: number) {
  return normalizeDegrees(windFromDirectionDeg + 180)
}

export function compassDirection(degrees: number) {
  const normalized = normalizeDegrees(degrees)
  const index = Math.round(normalized / 45) % COMPASS_DIRECTIONS.length
  return COMPASS_DIRECTIONS[index]
}

export function classifyWind(speedMs: number): WindWarningLevel {
  assertNonNegative(speedMs, 'wind speed')

  if (speedMs < 2) return 'calm'
  if (speedMs < 5) return 'light'
  if (speedMs < 10) return 'moderate'
  if (speedMs < 15) return 'strong'
  return 'very-strong'
}

export function arrowLengthKm(speedMs: number) {
  assertNonNegative(speedMs, 'wind speed')
  return Math.min(150, Math.max(20, speedMs * 8))
}

export function destinationPoint(
  origin: Coordinates,
  bearingDeg: number,
  distanceKm: number,
): Coordinates {
  assertFinite(origin.latitude, 'latitude')
  assertFinite(origin.longitude, 'longitude')
  assertNonNegative(distanceKm, 'distance')

  const latitude = (origin.latitude * Math.PI) / 180
  const longitude = (origin.longitude * Math.PI) / 180
  const bearing = (normalizeDegrees(bearingDeg) * Math.PI) / 180
  const angularDistance = distanceKm / EARTH_RADIUS_KM

  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) *
        Math.sin(angularDistance) *
        Math.cos(bearing),
  )
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) *
        Math.sin(angularDistance) *
        Math.cos(latitude),
      Math.cos(angularDistance) -
        Math.sin(latitude) *
          Math.sin(destinationLatitude),
    )

  return {
    latitude: (destinationLatitude * 180) / Math.PI,
    longitude: ((((destinationLongitude * 180) / Math.PI + 540) % 360) - 180),
  }
}

export function createDownwindSector(
  origin: Coordinates,
  bearingDeg: number,
  widthDeg: number,
  radiusKm: number,
): GeoJsonSector {
  assertFinite(widthDeg, 'sector width')
  if (widthDeg <= 0 || widthDeg > 360) {
    throw new RangeError('sector width must be greater than 0 and no greater than 360')
  }
  assertNonNegative(radiusKm, 'sector radius')
  if (radiusKm === 0) {
    throw new RangeError('sector radius must be greater than 0')
  }

  const points = Math.max(4, Math.ceil(widthDeg / 5))
  const startBearing = bearingDeg - widthDeg / 2
  const coordinates: number[][] = [
    [origin.longitude, origin.latitude],
  ]

  for (let index = 0; index <= points; index += 1) {
    const bearing = startBearing + (widthDeg * index) / points
    const point = destinationPoint(origin, bearing, radiusKm)
    coordinates.push([point.longitude, point.latitude])
  }

  coordinates.push([origin.longitude, origin.latitude])

  return {
    type: 'Feature',
    properties: { label: 'Indicative downwind area' },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  }
}
