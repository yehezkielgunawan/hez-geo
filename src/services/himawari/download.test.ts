import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadObservation } from './download'
import { observationPrefix } from './filenames'
import type { HimawariBand, HimawariObject, HimawariObservation } from './types'

const observedAt = '2026-09-08T14:20:00.000Z'
const observationDate = new Date(observedAt)
const outputDirectories: string[] = []

function objectFor(band: HimawariBand, segment: number, content: string): HimawariObject {
  const date = [
    observationDate.getUTCFullYear(),
    String(observationDate.getUTCMonth() + 1).padStart(2, '0'),
    String(observationDate.getUTCDate()).padStart(2, '0'),
  ].join('')
  const time = `${String(observationDate.getUTCHours()).padStart(2, '0')}${String(observationDate.getUTCMinutes()).padStart(2, '0')}`
  const filename = `HS_H09_${date}_${time}_${band}_FLDK_R20_S${String(segment).padStart(2, '0')}10.DAT.bz2`
  const key = `${observationPrefix(observationDate)}${filename}`

  return {
    key,
    url: `https://noaa-himawari9.s3.amazonaws.com/${key}`,
    size: Buffer.byteLength(content),
    etag: `${band}-${segment}`,
    band,
    segment,
    segmentCount: 10,
    resolution: 'R20',
    observedAt,
  }
}

function makeObservation(overrides: HimawariObject[] = [], complete = true): HimawariObservation {
  const objects = (['B11', 'B13', 'B15'] as HimawariBand[]).flatMap((band) =>
    Array.from({ length: 10 }, (_, index) => {
      const segment = index + 1
      return (
        overrides.find((object) => object.band === band && object.segment === segment) ??
        objectFor(band, segment, `${band.toLowerCase()}-${segment}-data`)
      )
    }),
  )

  return {
    id: observedAt,
    observedAt,
    prefix: observationPrefix(observationDate),
    complete,
    totalObjects: objects.length,
    totalBytes: objects.reduce((total, object) => total + object.size, 0),
    bands: {
      B11: objects.filter((object) => object.band === 'B11'),
      B13: objects.filter((object) => object.band === 'B13'),
      B15: objects.filter((object) => object.band === 'B15'),
    },
  }
}

function allObjects(observation: HimawariObservation): HimawariObject[] {
  return [...observation.bands.B11, ...observation.bands.B13, ...observation.bands.B15]
}

function bodyFor(
  input: RequestInfo | URL,
  observation: HimawariObservation,
  overrides: Map<string, string> = new Map(),
): BodyInit {
  const url = String(input)
  const override = overrides.get(url)
  if (override !== undefined) return override

  const object = allObjects(observation).find((candidate) => candidate.url === url)
  if (!object) throw new Error(`unexpected URL: ${url}`)
  return new Uint8Array(object.size)
}

async function temporaryOutput(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'himawari-download-'))
  outputDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(outputDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('downloadObservation', () => {
  it('streams all objects and writes the manifest after success', async () => {
    const outputRoot = await temporaryOutput()
    const overrides = [
      objectFor('B11', 1, 'b11-data'),
      objectFor('B13', 1, 'b13-data'),
      objectFor('B15', 1, 'b15-data'),
    ]
    const observation = makeObservation(overrides)
    const contents = new Map(overrides.map((object) => [object.url, object.band.toLowerCase() + '-data']))
    const progress: boolean[] = []
    const manifestPath = await downloadObservation(observation, {
      outputRoot,
      fetcher: async (input) => new Response(bodyFor(input, observation, contents)),
      now: observationDate,
      onProgress: ({ reused }) => progress.push(reused),
    })

    expect(progress).toHaveLength(30)
    expect(progress.every((reused) => !reused)).toBe(true)
    expect(await readFile(join(outputRoot, '2026/09/08/1420', overrides[0].key.split('/').pop()!), 'utf8')).toBe(
      'b11-data',
    )
    expect(manifestPath).toBe(join(outputRoot, '2026/09/08/1420/observation.json'))
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      status: 'downloaded',
      id: observedAt,
      observedAt,
      source: 'NOAA Himawari-9 Open Data',
      totalObjects: 30,
    })
    expect(manifest.bands.B11[0]).toMatchObject({
      segment: 1,
      localPath: expect.stringContaining('B11'),
    })
  })

  it('retries a failed request three times before succeeding', async () => {
    const outputRoot = await temporaryOutput()
    const object = objectFor('B11', 1, 'retry-data')
    const observation = makeObservation([object])
    let attempts = 0

    await downloadObservation(observation, {
      outputRoot,
      retries: 3,
      sleep: async () => undefined,
      fetcher: async (input) => {
        if (String(input) === object.url) {
          attempts += 1
          if (attempts < 3) throw new Error('temporary network failure')
          return new Response('retry-data')
        }
        return new Response(bodyFor(input, observation))
      },
    })

    expect(attempts).toBe(3)
  })

  it('removes a partial file and does not write a manifest after a size mismatch', async () => {
    const outputRoot = await temporaryOutput()
    const object = objectFor('B11', 1, 'expected-data')
    const observation = makeObservation([object])

    await expect(
      downloadObservation(observation, {
        outputRoot,
        retries: 1,
        concurrency: 1,
        fetcher: async () => new Response('wrong'),
      }),
    ).rejects.toThrow(`downloaded 5 bytes but expected ${object.size}`)

    const directory = join(outputRoot, '2026/09/08/1420')
    await expect(stat(join(directory, `${object.key.split('/').pop()}.part`))).rejects.toThrow()
    await expect(stat(join(directory, object.key.split('/').pop()!))).rejects.toThrow()
    await expect(stat(join(directory, 'observation.json'))).rejects.toThrow()
  })

  it('reuses an existing file with the expected size', async () => {
    const outputRoot = await temporaryOutput()
    const object = objectFor('B11', 1, 'existing-data')
    const observation = makeObservation([object])
    const filename = object.key.split('/').pop()!
    const directory = join(outputRoot, '2026/09/08/1420')
    await mkdir(directory, { recursive: true })
    for (const candidate of allObjects(observation)) {
      await writeFile(
        join(directory, candidate.key.split('/').pop()!),
        candidate.url === object.url ? 'existing-data' : new Uint8Array(candidate.size),
      )
    }
    await writeFile(join(directory, `${filename}.part`), 'stale-part')
    let fetchCount = 0
    const progress: boolean[] = []

    await downloadObservation(observation, {
      outputRoot,
      fetcher: async () => {
        fetchCount += 1
        throw new Error('should not fetch reused file')
      },
      onProgress: ({ reused }) => progress.push(reused),
    })

    expect(fetchCount).toBe(0)
    expect(progress).toHaveLength(30)
    expect(progress.every((reused) => reused)).toBe(true)
    await expect(stat(join(directory, `${filename}.part`))).rejects.toThrow()
  })

  it('keeps concurrent downloads within the configured limit', async () => {
    const outputRoot = await temporaryOutput()
    const observation = makeObservation()
    let active = 0
    let maximumActive = 0

    await downloadObservation(observation, {
      outputRoot,
      concurrency: 4,
      fetcher: async (input) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return new Response(bodyFor(input, observation))
      },
    })

    expect(maximumActive).toBeLessThanOrEqual(4)
  })

  it('waits for other workers to settle before reporting a failure', async () => {
    const outputRoot = await temporaryOutput()
    const observation = makeObservation()
    const failingObject = observation.bands.B11[0]
    const slowObject = observation.bands.B11[1]
    let slowRequestFinished = false

    await expect(
      downloadObservation(observation, {
        outputRoot,
        concurrency: 2,
        retries: 1,
        fetcher: async (input) => {
          if (String(input) === failingObject.url) throw new Error('permanent failure')
          await new Promise((resolve) => setTimeout(resolve, 20))
          slowRequestFinished = true
          return new Response(bodyFor(input, observation))
        },
      }),
    ).rejects.toThrow('permanent failure')

    expect(slowRequestFinished).toBe(true)
    await expect(
      stat(join(outputRoot, '2026/09/08/1420', `${slowObject.key.split('/').pop()}.part`)),
    ).rejects.toThrow()
  })

  it('rejects an incomplete observation before downloading', async () => {
    const outputRoot = await temporaryOutput()

    await expect(
      downloadObservation(makeObservation([], false), { outputRoot }),
    ).rejects.toThrow('cannot download incomplete Himawari observation')
  })

  it('times out a stalled download and removes its partial file', async () => {
    const outputRoot = await temporaryOutput()
    const observation = makeObservation()
    const object = observation.bands.B11[0]

    await expect(
      downloadObservation(observation, {
        outputRoot,
        concurrency: 1,
        retries: 1,
        timeoutMs: 5,
        fetcher: async (input, init) => {
          if (String(input) === object.url) {
            return new Promise((_, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
            })
          }
          return new Response(bodyFor(input, observation))
        },
      }),
    ).rejects.toThrow('download timed out after 5ms')

    await expect(
      stat(join(outputRoot, '2026/09/08/1420', `${object.key.split('/').pop()}.part`)),
    ).rejects.toThrow()
  })
})
