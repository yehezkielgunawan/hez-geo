import { describe, expect, it } from 'vitest'
import { findLatestCompleteObservation } from './discover'
import { observationPrefix } from './filenames'
import type { HimawariBand } from './types'
import type { ListedS3Object } from './s3'

const bands: HimawariBand[] = ['B11', 'B13', 'B15']

function fileParts(date: Date): { date: string; time: string } {
  const datePart = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, '0')))
    .join('')
  const timePart = [date.getUTCHours(), date.getUTCMinutes()]
    .map((value) => String(value).padStart(2, '0'))
    .join('')
  return { date: datePart, time: timePart }
}

function objectFor(
  date: Date,
  band: HimawariBand,
  segment: number,
  size = 100,
): ListedS3Object {
  const parts = fileParts(date)
  const filename = `HS_H09_${parts.date}_${parts.time}_${band}_FLDK_R20_S${String(segment).padStart(2, '0')}10.DAT.bz2`
  return {
    key: `${observationPrefix(date)}${filename}`,
    size,
    etag: `${band}-${segment}`,
  }
}

function completeListing(date: Date, size = 100): ListedS3Object[] {
  return bands.flatMap((band) =>
    Array.from({ length: 10 }, (_, index) => objectFor(date, band, index + 1, size)),
  )
}

describe('findLatestCompleteObservation', () => {
  it('selects the newest complete observation and builds all 30 objects', async () => {
    const now = new Date('2026-09-08T14:29:00Z')
    const newest = new Date('2026-09-08T14:20:00Z')
    const calls: string[] = []
    const listObjects = async (prefix: string) => {
      calls.push(prefix)
      return prefix === observationPrefix(newest)
        ? completeListing(newest, 200)
        : []
    }

    const result = await findLatestCompleteObservation({ now, listObjects })

    expect(calls).toEqual([observationPrefix(newest)])
    expect(result).toMatchObject({
      id: '2026-09-08T14:20:00.000Z',
      observedAt: '2026-09-08T14:20:00.000Z',
      prefix: observationPrefix(newest),
      complete: true,
      totalObjects: 30,
      totalBytes: 6000,
    })
    expect(result.bands.B11).toHaveLength(10)
    expect(result.bands.B13).toHaveLength(10)
    expect(result.bands.B15).toHaveLength(10)
    expect(result.bands.B11[0]).toMatchObject({
      key: expect.stringContaining('_B11_FLDK_R20_S0110.DAT.bz2'),
      url: expect.stringContaining('https://noaa-himawari9.s3.amazonaws.com/'),
      band: 'B11',
      segment: 1,
      size: 200,
    })
  })

  it('falls back when the newest candidate is incomplete', async () => {
    const now = new Date('2026-09-08T14:29:00Z')
    const newest = new Date('2026-09-08T14:20:00Z')
    const previous = new Date('2026-09-08T14:10:00Z')
    const calls: string[] = []
    const listObjects = async (prefix: string) => {
      calls.push(prefix)
      if (prefix === observationPrefix(newest)) return completeListing(newest).slice(0, 29)
      if (prefix === observationPrefix(previous)) return completeListing(previous)
      return []
    }

    const result = await findLatestCompleteObservation({ now, listObjects })

    expect(result.observedAt).toBe('2026-09-08T14:10:00.000Z')
    expect(calls).toEqual([observationPrefix(newest), observationPrefix(previous)])
  })

  it('does not accept a duplicate segment as a complete observation', async () => {
    const date = new Date('2026-09-08T14:20:00Z')
    const listing = completeListing(date)
    listing[1] = objectFor(date, 'B11', 1)

    await expect(
      findLatestCompleteObservation({
        now: new Date('2026-09-08T14:20:00Z'),
        lookbackMinutes: 0,
        listObjects: async () => listing,
      }),
    ).rejects.toThrow('no complete Himawari observation found')
  })

  it('reports the searched range when no complete observation exists', async () => {
    await expect(
      findLatestCompleteObservation({
        now: new Date('2026-09-08T14:29:00Z'),
        lookbackMinutes: 20,
        listObjects: async () => [],
      }),
    ).rejects.toThrow('no complete Himawari observation found between 2026-09-08T14:00:00.000Z and 2026-09-08T14:20:00.000Z')
  })
})
