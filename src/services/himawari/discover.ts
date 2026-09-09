import { listS3Prefix, type ListedS3Object } from './s3'
import {
  observationPrefix,
  parseHimawariFilename,
  recentObservationTimes,
  s3ObjectUrl,
} from './filenames'
import { HIMAWARI_BANDS, type HimawariBand, type HimawariObservation } from './types'

interface DiscoveryOptions {
  now?: Date
  lookbackMinutes?: number
  listObjects?: typeof listS3Prefix
}

function emptyBands(): Record<HimawariBand, HimawariObservation['bands'][HimawariBand]> {
  return {
    B11: [],
    B13: [],
    B15: [],
  }
}

function hasAllSegments(objects: HimawariObservation['bands'][HimawariBand]): boolean {
  if (objects.length !== 10) return false

  return objects.every((object, index) => object.segment === index + 1)
}

function buildObservation(
  date: Date,
  prefix: string,
  listedObjects: ListedS3Object[],
): HimawariObservation | null {
  const observedAt = date.toISOString()
  const bands = emptyBands()

  for (const listedObject of listedObjects) {
    if (!listedObject.key.startsWith(prefix)) continue

    const parsed = parseHimawariFilename(listedObject.key)
    if (!parsed || parsed.observedAt !== observedAt) continue

    bands[parsed.band].push({
      ...listedObject,
      url: s3ObjectUrl(listedObject.key),
      ...parsed,
    })
  }

  for (const band of HIMAWARI_BANDS) {
    bands[band].sort((left, right) => left.segment - right.segment)
    if (!hasAllSegments(bands[band])) return null
  }

  const objects = HIMAWARI_BANDS.flatMap((band) => bands[band])
  return {
    id: observedAt,
    observedAt,
    prefix,
    complete: true,
    totalObjects: objects.length,
    totalBytes: objects.reduce((total, object) => total + object.size, 0),
    bands,
  }
}

export async function findLatestCompleteObservation(
  options: DiscoveryOptions = {},
): Promise<HimawariObservation> {
  const now = options.now ?? new Date()
  const times = recentObservationTimes(now, options.lookbackMinutes ?? 180)
  const listObjects = options.listObjects ?? listS3Prefix

  for (const time of times) {
    const prefix = observationPrefix(time)
    const observation = buildObservation(time, prefix, await listObjects(prefix))
    if (observation) return observation
  }

  const oldest = times[times.length - 1].toISOString()
  const newest = times[0].toISOString()
  throw new Error(`no complete Himawari observation found between ${oldest} and ${newest}`)
}
