import { describe, expect, it } from 'vitest'
import { listS3Prefix } from './s3'

function s3Response(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { 'content-type': 'application/xml' },
  })
}

const prefix = 'AHI-L1b-FLDK/2026/09/08/1420/'

describe('listS3Prefix', () => {
  it('normalizes a single Contents element into one listed object', async () => {
    let requestedUrl = ''
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = String(input)
      return s3Response(`
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents>
            <Key>${prefix}HS_H09_20260908_1420_B11_FLDK_R20_S0110.DAT.bz2</Key>
            <ETag>"abc123"</ETag>
            <Size>12345</Size>
          </Contents>
        </ListBucketResult>
      `)
    }

    await expect(listS3Prefix(prefix, { fetcher })).resolves.toEqual([
      {
        key: `${prefix}HS_H09_20260908_1420_B11_FLDK_R20_S0110.DAT.bz2`,
        size: 12345,
        etag: 'abc123',
      },
    ])

    const url = new URL(requestedUrl)
    expect(url.origin).toBe('https://noaa-himawari9.s3.amazonaws.com')
    expect(url.searchParams.get('list-type')).toBe('2')
    expect(url.searchParams.get('prefix')).toBe(prefix)
  })

  it('parses multiple Contents elements and allows an empty result', async () => {
    const responses = [
      s3Response(`
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents>
            <Key>first</Key>
            <Size>1</Size>
          </Contents>
          <Contents>
            <Key>second</Key>
            <ETag>"etag-two"</ETag>
            <Size>2</Size>
          </Contents>
        </ListBucketResult>
      `),
      s3Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'),
    ]
    const fetcher: typeof fetch = async () => responses.shift() as Response

    await expect(listS3Prefix(prefix, { fetcher })).resolves.toEqual([
      { key: 'first', size: 1 },
      { key: 'second', size: 2, etag: 'etag-two' },
    ])
    await expect(listS3Prefix(prefix, { fetcher })).resolves.toEqual([])
  })

  it('follows continuation tokens until the listing is complete', async () => {
    const requestedUrls: string[] = []
    const fetcher: typeof fetch = async (input) => {
      requestedUrls.push(String(input))
      if (requestedUrls.length === 1) {
        return s3Response(`
          <ListBucketResult>
            <IsTruncated>true</IsTruncated>
            <NextContinuationToken>next-page</NextContinuationToken>
            <Contents><Key>first</Key><Size>1</Size></Contents>
          </ListBucketResult>
        `)
      }

      return s3Response(`
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents><Key>second</Key><Size>2</Size></Contents>
        </ListBucketResult>
      `)
    }

    await expect(listS3Prefix(prefix, { fetcher })).resolves.toEqual([
      { key: 'first', size: 1 },
      { key: 'second', size: 2 },
    ])
    expect(new URL(requestedUrls[1]).searchParams.get('continuation-token')).toBe('next-page')
  })

  it('rejects an HTTP error response', async () => {
    const fetcher: typeof fetch = async () => s3Response('<Error />', 503)

    await expect(listS3Prefix(prefix, { fetcher, retries: 1 })).rejects.toThrow(
      'NOAA S3 list request failed with 503',
    )
  })

  it('rejects malformed listing XML', async () => {
    const fetcher: typeof fetch = async () => s3Response('<ListBucketResult>')

    await expect(listS3Prefix(prefix, { fetcher })).rejects.toThrow(
      'NOAA S3 response was malformed',
    )
  })

  it('rejects a continuation token loop', async () => {
    const fetcher: typeof fetch = async () =>
      s3Response(`
        <ListBucketResult>
          <IsTruncated>true</IsTruncated>
          <NextContinuationToken>same-token</NextContinuationToken>
        </ListBucketResult>
      `)

    await expect(listS3Prefix(prefix, { fetcher })).rejects.toThrow(
      'NOAA S3 listing repeated a continuation token',
    )
  })

  it('retries transient listing failures', async () => {
    let attempts = 0
    const fetcher: typeof fetch = async () => {
      attempts += 1
      if (attempts < 3) return s3Response('<Error />', 503)
      return s3Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
    }

    await expect(
      listS3Prefix(prefix, { fetcher, retries: 3, sleep: async () => undefined }),
    ).resolves.toEqual([])
    expect(attempts).toBe(3)
  })

  it('times out a stalled listing request', async () => {
    const fetcher: typeof fetch = async (_input, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })

    await expect(
      listS3Prefix(prefix, { fetcher, retries: 1, timeoutMs: 5 }),
    ).rejects.toThrow('NOAA S3 list request timed out after 5ms')
  })
})
