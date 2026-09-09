import { describe, expect, it } from 'vitest'
import { runHimawariLatest } from './himawari-latest'
import type { DownloadProgress } from '../services/himawari/download'
import type { HimawariObject, HimawariObservation } from '../services/himawari/types'

const observation: HimawariObservation = {
  id: '2026-09-08T14:20:00.000Z',
  observedAt: '2026-09-08T14:20:00.000Z',
  prefix: 'AHI-L1b-FLDK/2026/09/08/1420/',
  complete: true,
  totalObjects: 30,
  totalBytes: 78_643_200,
  bands: { B11: [], B13: [], B15: [] },
}

describe('runHimawariLatest', () => {
  it('reports the selected observation and download summary', async () => {
    const logs: string[] = []
    let receivedProgress: ((progress: DownloadProgress) => void) | undefined
    const progressObject = {} as HimawariObject
    const progressEvents: DownloadProgress[] = [
      { completed: 1, total: 30, reused: false, object: progressObject },
      { completed: 2, total: 30, reused: true, object: progressObject },
    ]

    const manifestPath = await runHimawariLatest(
      {
        findLatestCompleteObservation: async () => observation,
        downloadObservation: async (_observation, options) => {
          receivedProgress = options?.onProgress
          for (const progress of progressEvents) options?.onProgress?.(progress)
          return 'data/himawari/2026/09/08/1420/observation.json'
        },
      },
      (message) => logs.push(message),
    )

    expect(manifestPath).toBe('data/himawari/2026/09/08/1420/observation.json')
    expect(receivedProgress).toBeTypeOf('function')
    expect(logs).toEqual([
      'Latest complete Himawari-9 observation',
      'Observed: 2026-09-08T14:20:00.000Z',
      'Objects: 30',
      'Expected download: 75.0 MB',
      'Downloading B11/B13/B15 with concurrency 4...',
      'Progress: 1/30',
      'Progress: 2/30',
      'Downloaded: 1',
      'Reused: 1',
      'Manifest: data/himawari/2026/09/08/1420/observation.json',
    ])
  })
})
