import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { HimawariBand, HimawariObject, HimawariObservation } from './types'
import { HIMAWARI_BANDS } from './types'

export interface DownloadProgress {
  completed: number
  total: number
  reused: boolean
  object: HimawariObject
}

export interface HimawariManifest {
  schemaVersion: 1
  status: 'downloaded'
  id: string
  observedAt: string
  downloadedAt: string
  source: 'NOAA Himawari-9 Open Data'
  prefix: string
  totalObjects: number
  totalBytes: number
  bands: Record<HimawariBand, HimawariManifestObject[]>
}

export interface HimawariManifestObject {
  key: string
  url: string
  size: number
  etag?: string
  localPath: string
  segment: number
  segmentCount: number
  resolution: string
  observedAt: string
}

interface DownloadOptions {
  outputRoot?: string
  fetcher?: typeof fetch
  concurrency?: number
  retries?: number
  timeoutMs?: number
  now?: Date
  sleep?: (milliseconds: number) => Promise<void>
  onProgress?: (progress: DownloadProgress) => void
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function observationDirectory(outputRoot: string, observedAt: string): string {
  const date = new Date(observedAt)
  if (!Number.isFinite(date.getTime())) throw new Error(`invalid observation time: ${observedAt}`)

  return join(
    outputRoot,
    String(date.getUTCFullYear()),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`,
  )
}

function objectFilename(key: string): string {
  const filename = key.slice(key.lastIndexOf('/') + 1)
  if (!filename || filename === '.' || filename === '..') {
    throw new Error(`invalid Himawari object key: ${key}`)
  }

  return filename
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function downloadToPart(
  object: HimawariObject,
  partPath: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetcher(object.url, { signal: controller.signal })
    if (!response.ok) throw new Error(`request failed with ${response.status}`)
    if (!response.body) throw new Error('response did not include a body')

    let bytes = 0
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.byteLength
        callback(null, chunk)
      },
    })

    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      counter,
      createWriteStream(partPath),
    )

    if (bytes !== object.size) {
      throw new Error(`downloaded ${bytes} bytes but expected ${object.size}`)
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`download timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function isReusableFile(path: string, expectedSize: number): Promise<boolean> {
  try {
    const file = await stat(path)
    return file.isFile() && file.size === expectedSize
  } catch {
    return false
  }
}

async function downloadObject(
  object: HimawariObject,
  directory: string,
  options: Required<Pick<DownloadOptions, 'fetcher' | 'retries' | 'sleep' | 'timeoutMs'>>,
): Promise<boolean> {
  const filename = objectFilename(object.key)
  const finalPath = join(directory, filename)
  const partPath = `${finalPath}.part`

  if (await isReusableFile(finalPath, object.size)) {
    await rm(partPath, { force: true })
    return true
  }

  await rm(finalPath, { force: true })
  let lastError: unknown

  for (let attempt = 0; attempt < options.retries; attempt += 1) {
    if (attempt > 0) await options.sleep(attempt * 1000)

    try {
      await rm(partPath, { force: true })
      await downloadToPart(object, partPath, options.fetcher, options.timeoutMs)
      await rename(partPath, finalPath)
      return false
    } catch (error) {
      lastError = error
      await rm(partPath, { force: true })
    }
  }

  throw new Error(
    `failed to download ${object.key} after ${options.retries} attempts: ${errorMessage(lastError)}`,
  )
}

function manifestObject(object: HimawariObject): HimawariManifestObject {
  return {
    key: object.key,
    url: object.url,
    size: object.size,
    ...(object.etag ? { etag: object.etag } : {}),
    localPath: objectFilename(object.key),
    segment: object.segment,
    segmentCount: object.segmentCount,
    resolution: object.resolution,
    observedAt: object.observedAt,
  }
}

function createManifest(
  observation: HimawariObservation,
  downloadedAt: string,
): HimawariManifest {
  return {
    schemaVersion: 1,
    status: 'downloaded',
    id: observation.id,
    observedAt: observation.observedAt,
    downloadedAt,
    source: 'NOAA Himawari-9 Open Data',
    prefix: observation.prefix,
    totalObjects: observation.totalObjects,
    totalBytes: observation.totalBytes,
    bands: {
      B11: observation.bands.B11.map(manifestObject),
      B13: observation.bands.B13.map(manifestObject),
      B15: observation.bands.B15.map(manifestObject),
    },
  }
}

function validateObservation(
  observation: HimawariObservation,
  objects: HimawariObject[],
): void {
  if (
    !observation.complete ||
    observation.totalObjects !== 30 ||
    objects.length !== 30 ||
    HIMAWARI_BANDS.some((band) => {
      const bandObjects = observation.bands[band]
      return (
        bandObjects.length !== 10 ||
        new Set(bandObjects.map((object) => object.segment)).size !== 10 ||
        !bandObjects.every((object) => object.segment >= 1 && object.segment <= 10)
      )
    })
  ) {
    throw new Error('cannot download incomplete Himawari observation')
  }

  const totalBytes = objects.reduce((total, object) => total + object.size, 0)
  if (totalBytes !== observation.totalBytes) {
    throw new Error('cannot download Himawari observation with inconsistent byte totals')
  }
}

export async function downloadObservation(
  observation: HimawariObservation,
  options: DownloadOptions = {},
): Promise<string> {
  const outputRoot = options.outputRoot ?? resolve('data/himawari')
  const fetcher = options.fetcher ?? globalThis.fetch
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4))
  const retries = Math.max(1, Math.floor(options.retries ?? 3))
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 120_000))
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const downloadedAt = (options.now ?? new Date()).toISOString()
  const directory = observationDirectory(outputRoot, observation.observedAt)
  const manifestPath = join(directory, 'observation.json')
  const manifestPartPath = `${manifestPath}.part`
  const objects = HIMAWARI_BANDS.flatMap((band) => observation.bands[band])

  validateObservation(observation, objects)

  await mkdir(directory, { recursive: true })
  await rm(manifestPartPath, { force: true })

  let nextIndex = 0
  let completed = 0
  const workerCount = Math.min(concurrency, objects.length)
  const workerOptions = { fetcher, retries, sleep, timeoutMs }
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < objects.length) {
      const object = objects[nextIndex]
      nextIndex += 1
      const reused = await downloadObject(object, directory, workerOptions)
      completed += 1
      options.onProgress?.({ completed, total: objects.length, reused, object })
    }
  })

  const workerResults = await Promise.allSettled(workers)
  const failedWorker = workerResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failedWorker) throw failedWorker.reason

  const manifest = createManifest(observation, downloadedAt)
  try {
    await writeFile(manifestPartPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await rename(manifestPartPath, manifestPath)
  } catch (error) {
    await rm(manifestPartPath, { force: true })
    throw error
  }

  return manifestPath
}
