import { XMLParser } from 'fast-xml-parser'

const S3_LIST_URL = 'https://noaa-himawari9.s3.amazonaws.com/'

export interface ListedS3Object {
  key: string
  size: number
  etag?: string
}

export interface ListS3PrefixOptions {
  fetcher?: typeof fetch
  retries?: number
  timeoutMs?: number
  sleep?: (milliseconds: number) => Promise<void>
}

interface S3Page {
  objects: ListedS3Object[]
  isTruncated: boolean
  nextContinuationToken?: string
}

const parser = new XMLParser({
  isArray: (tagName) => tagName === 'Contents',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`missing ${field}`)
  }

  return value
}

function parseBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return null
}

function parsePage(xml: string): S3Page {
  let parsed: unknown

  try {
    parsed = parser.parse(xml)
  } catch {
    throw new Error('NOAA S3 response was malformed')
  }

  try {
    if (!isRecord(parsed) || !isRecord(parsed.ListBucketResult)) {
      throw new Error('invalid root')
    }

    const root = parsed.ListBucketResult
    const isTruncated = parseBoolean(root.IsTruncated)
    if (isTruncated === null) throw new Error('invalid truncation flag')

    const contents = root.Contents === undefined ? [] : root.Contents
    if (!Array.isArray(contents)) throw new Error('invalid contents')

    const objects = contents.map((content): ListedS3Object => {
      if (!isRecord(content)) throw new Error('invalid content')

      const key = requiredString(content.Key, 'object key')
      const size = typeof content.Size === 'number' ? content.Size : Number(content.Size)
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('invalid object size')

      const etag = typeof content.ETag === 'string' ? content.ETag.replace(/^"|"$/g, '') : undefined
      return etag ? { key, size, etag } : { key, size }
    })

    const nextContinuationToken =
      typeof root.NextContinuationToken === 'string' && root.NextContinuationToken.length > 0
        ? root.NextContinuationToken
        : undefined

    return { objects, isTruncated, nextContinuationToken }
  } catch {
    throw new Error('NOAA S3 response was malformed')
  }
}

async function fetchPage(
  url: URL,
  options: Required<Pick<ListS3PrefixOptions, 'fetcher' | 'retries' | 'timeoutMs' | 'sleep'>>,
): Promise<Response> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < options.retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs)

    try {
      const response = await options.fetcher(url, { signal: controller.signal })
      if (response.ok) return response
      lastError = new Error(`NOAA S3 list request failed with ${response.status}`)
    } catch (error) {
      lastError = controller.signal.aborted
        ? new Error(`NOAA S3 list request timed out after ${options.timeoutMs}ms`)
        : new Error(
            `NOAA S3 list request failed: ${error instanceof Error ? error.message : String(error)}`,
          )
    } finally {
      clearTimeout(timeout)
    }

    if (attempt < options.retries - 1) await options.sleep((attempt + 1) * 1000)
  }

  throw lastError ?? new Error('NOAA S3 list request failed')
}

export async function listS3Prefix(
  prefix: string,
  options: ListS3PrefixOptions = {},
): Promise<ListedS3Object[]> {
  const fetcher = options.fetcher ?? globalThis.fetch
  const retries = Math.max(1, Math.floor(options.retries ?? 3))
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 30_000))
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const objects: ListedS3Object[] = []
  const seenContinuationTokens = new Set<string>()
  let continuationToken: string | undefined

  while (true) {
    const url = new URL(S3_LIST_URL)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('prefix', prefix)
    if (continuationToken) url.searchParams.set('continuation-token', continuationToken)

    const response = await fetchPage(url, { fetcher, retries, timeoutMs, sleep })
    const page = parsePage(await response.text())
    objects.push(...page.objects)

    if (!page.isTruncated) return objects
    if (!page.nextContinuationToken || seenContinuationTokens.has(page.nextContinuationToken)) {
      throw new Error('NOAA S3 listing repeated a continuation token')
    }

    seenContinuationTokens.add(page.nextContinuationToken)
    continuationToken = page.nextContinuationToken
  }
}
