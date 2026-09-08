export type WindLevel = '850hPa'

export type WindWarningLevel =
  | 'calm'
  | 'light'
  | 'moderate'
  | 'strong'
  | 'very-strong'

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface Volcano extends Coordinates {
  id: string
  name: string
  elevationM: number
  defaultWindLevel: WindLevel
}

export interface WindObservation {
  observedAt: string
  retrievedAt: string
  level: WindLevel
  windSpeedMs: number
  windFromDirectionDeg: number
  windToDirectionDeg: number
  windFromLabel: string
  windToLabel: string
  warningLevel: WindWarningLevel
  arrowLengthKm: number
  sectorWidthDeg: number
  sectorRadiusKm: number
  provider: string
}

export interface ObservationMetadata {
  imageUrl: string
  mediaType: 'image'
  observedAt: string
  sourceName: string
  sourceUrl: string
  attribution: string
  isGeoreferenced: boolean
  bounds?: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ]
}

export interface GeoJsonSector {
  type: 'Feature'
  properties: {
    label: string
  }
  geometry: {
    type: 'Polygon'
    coordinates: number[][][]
  }
}
