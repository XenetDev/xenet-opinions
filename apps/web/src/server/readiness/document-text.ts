import { extractText } from 'unpdf'

const MAX_CHARS = 12_000

async function rawText(file: { bytes: Uint8Array; mediaType: string }): Promise<string> {
  if (file.mediaType === 'application/pdf')
    return (await extractText(new Uint8Array(file.bytes), { mergePages: true })).text
  return new TextDecoder().decode(file.bytes)
}

export async function documentText(file: { bytes: Uint8Array; mediaType: string; filename: string }): Promise<string> {
  try {
    return (await rawText(file)).trim().slice(0, MAX_CHARS)
  } catch (error) {
    console.error('document text extraction failed', { filename: file.filename, error })
    return ''
  }
}
