import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findLatestCompleteObservation } from '../services/himawari/discover'
import { downloadObservation } from '../services/himawari/download'
import type { DownloadProgress } from '../services/himawari/download'

interface HimawariCliDependencies {
  findLatestCompleteObservation: typeof findLatestCompleteObservation
  downloadObservation: typeof downloadObservation
}

type Logger = (message: string) => void

const defaultDependencies: HimawariCliDependencies = {
  findLatestCompleteObservation,
  downloadObservation,
}

function formatMegabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

export async function runHimawariLatest(
  dependencies: HimawariCliDependencies = defaultDependencies,
  logger: Logger = (message) => console.log(message),
): Promise<string> {
  const observation = await dependencies.findLatestCompleteObservation()
  logger('Latest complete Himawari-9 observation')
  logger(`Observed: ${observation.observedAt}`)
  logger(`Objects: ${observation.totalObjects}`)
  logger(`Expected download: ${formatMegabytes(observation.totalBytes)} MB`)
  logger('Downloading B11/B13/B15 with concurrency 4...')

  let downloaded = 0
  let reused = 0
  const manifestPath = await dependencies.downloadObservation(observation, {
    onProgress: (progress: DownloadProgress) => {
      if (progress.reused) reused += 1
      else downloaded += 1
      logger(`Progress: ${progress.completed}/${progress.total}`)
    },
  })

  logger(`Downloaded: ${downloaded}`)
  logger(`Reused: ${reused}`)
  logger(`Manifest: ${manifestPath}`)
  return manifestPath
}

function isEntrypoint(): boolean {
  const script = process.argv[1]
  return script !== undefined && import.meta.url === pathToFileURL(resolve(script)).href
}

if (isEntrypoint()) {
  void runHimawariLatest().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Himawari acquisition failed: ${message}`)
    process.exitCode = 1
  })
}
