import { describe, expect, it } from 'vitest'
import {
  observationPrefix,
  parseHimawariFilename,
  recentObservationTimes,
  roundDownToTenMinutes,
  s3ObjectUrl,
} from './filenames'

describe('parseHimawariFilename', () => {
  it('parses a B11 ten-segment Full Disk filename', () => {
    expect(
      parseHimawariFilename('HS_H09_20260908_1420_B11_FLDK_R20_S0110.DAT.bz2'),
    ).toEqual({
      band: 'B11',
      observedAt: '2026-09-08T14:20:00.000Z',
      resolution: 'R20',
      segment: 1,
      segmentCount: 10,
    })
  })

  it('parses B13 and B15 files from a complete segment set', () => {
    expect(parseHimawariFilename('HS_H09_20260908_1420_B13_FLDK_R20_S0510.DAT.bz2')).toMatchObject({
      band: 'B13',
      segment: 5,
      segmentCount: 10,
    })
    expect(parseHimawariFilename('HS_H09_20260908_1420_B15_FLDK_R20_S1010.DAT.bz2')).toMatchObject({
      band: 'B15',
      segment: 10,
      segmentCount: 10,
    })
  })

  it('accepts a full S3 key and still parses the filename', () => {
    expect(
      parseHimawariFilename(
        'AHI-L1b-FLDK/2026/09/08/1420/HS_H09_20260908_1420_B11_FLDK_R20_S0110.DAT.bz2',
      ),
    ).toMatchObject({ band: 'B11', segment: 1 })
  })

  it.each([
    'HS_H08_20260908_1420_B11_FLDK_R20_S0110.DAT.bz2',
    'HS_H09_20260908_1420_B10_FLDK_R20_S0110.DAT.bz2',
    'HS_H09_20260908_1420_B11_R20_S0110.DAT.bz2',
    'HS_H09_20260908_2420_B11_FLDK_R20_S0110.DAT.bz2',
    'HS_H09_20260931_1420_B11_FLDK_R20_S0110.DAT.bz2',
    'HS_H09_20260908_1420_B11_FLDK_R20_S0010.DAT.bz2',
    'HS_H09_20260908_1420_B11_FLDK_R20_S1110.DAT.bz2',
    'HS_H09_20260908_1420_B11_FLDK_R20_S0111.DAT.bz2',
  ])('rejects %s', (filename) => {
    expect(parseHimawariFilename(filename)).toBeNull()
  })
})

describe('Himawari observation time helpers', () => {
  it('rounds a UTC time down to the current ten-minute slot', () => {
    expect(roundDownToTenMinutes(new Date('2026-09-08T14:29:37.123Z')).toISOString()).toBe(
      '2026-09-08T14:20:00.000Z',
    )
  })

  it('generates newest-first ten-minute slots across a UTC day boundary', () => {
    expect(
      recentObservationTimes(new Date('2026-01-01T00:05:00Z'), 20).map((time) => time.toISOString()),
    ).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2025-12-31T23:50:00.000Z',
      '2025-12-31T23:40:00.000Z',
    ])
  })

  it('builds the NOAA prefix and unsigned object URL', () => {
    const time = new Date('2026-09-08T14:20:00Z')
    const key = `${observationPrefix(time)}HS_H09_20260908_1420_B11_FLDK_R20_S0110.DAT.bz2`

    expect(observationPrefix(time)).toBe('AHI-L1b-FLDK/2026/09/08/1420/')
    expect(s3ObjectUrl(key)).toBe(`https://noaa-himawari9.s3.amazonaws.com/${key}`)
  })
})
