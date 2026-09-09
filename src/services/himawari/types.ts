export const HIMAWARI_BANDS = ['B11', 'B13', 'B15'] as const

export type HimawariBand = (typeof HIMAWARI_BANDS)[number]

export interface ParsedHimawariFilename {
  band: HimawariBand
  observedAt: string
  resolution: string
  segment: number
  segmentCount: number
}

export interface HimawariObject {
  key: string
  url: string
  size: number
  etag?: string
  band: HimawariBand
  segment: number
  segmentCount: number
  resolution: string
  observedAt: string
}

export interface HimawariObservation {
  id: string
  observedAt: string
  prefix: string
  complete: boolean
  totalObjects: number
  totalBytes: number
  bands: Record<HimawariBand, HimawariObject[]>
}
