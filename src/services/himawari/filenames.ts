import type { HimawariBand, ParsedHimawariFilename } from './types'

const HIMAWARI_S3_BASE_URL = 'https://noaa-himawari9.s3.amazonaws.com'
const HIMAWARI_FILENAME =
  /^HS_H09_(\d{8})_(\d{4})_(B11|B13|B15)_FLDK_(R\d{2})_S(\d{2})(\d{2})\.DAT\.bz2$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isSameUtcDate(date: Date, year: number, month: number, day: number): boolean {
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function parseHimawariFilename(input: string): ParsedHimawariFilename | null {
  const filename = input.slice(input.lastIndexOf('/') + 1)
  const match = HIMAWARI_FILENAME.exec(filename)

  if (!match) return null

  const [, dateText, timeText, band, resolution, segmentText, segmentCountText] = match
  const year = Number(dateText.slice(0, 4))
  const month = Number(dateText.slice(4, 6))
  const day = Number(dateText.slice(6, 8))
  const hour = Number(timeText.slice(0, 2))
  const minute = Number(timeText.slice(2, 4))
  const observedAt = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const segment = Number(segmentText)
  const segmentCount = Number(segmentCountText)

  if (
    !isSameUtcDate(observedAt, year, month, day) ||
    observedAt.getUTCHours() !== hour ||
    observedAt.getUTCMinutes() !== minute ||
    segmentCount !== 10 ||
    segment < 1 ||
    segment > segmentCount
  ) {
    return null
  }

  return {
    band: band as HimawariBand,
    observedAt: observedAt.toISOString(),
    resolution,
    segment,
    segmentCount,
  }
}

export function roundDownToTenMinutes(date: Date): Date {
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('cannot round an invalid date')
  }

  const rounded = new Date(date)
  rounded.setUTCSeconds(0, 0)
  rounded.setUTCMinutes(Math.floor(rounded.getUTCMinutes() / 10) * 10)
  return rounded
}

export function recentObservationTimes(
  now: Date,
  lookbackMinutes = 180,
): Date[] {
  const newest = roundDownToTenMinutes(now)
  const lookback = Math.max(0, Math.floor(lookbackMinutes))
  const times: Date[] = []

  for (let offset = 0; offset <= lookback; offset += 10) {
    times.push(new Date(newest.getTime() - offset * 60_000))
  }

  return times
}

export function observationPrefix(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('cannot build a prefix from an invalid date')
  }

  return [
    'AHI-L1b-FLDK',
    `${date.getUTCFullYear()}`,
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`,
  ].join('/') + '/'
}

export function s3ObjectUrl(key: string): string {
  const encodedKey = key.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `${HIMAWARI_S3_BASE_URL}/${encodedKey}`
}
