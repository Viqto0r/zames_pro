import fs from 'fs/promises'

// Shared attachment plumbing for the THREE providers (DeepSeek, Qwen, GLM).
// The per-provider SELECTORS stay in `<provider>-ui.ts`; only the
// provider-INDEPENDENT steps live here: reading the files into a Playwright
// payload and waiting for the upload chip. Keeping them in ONE place stops the
// `_attachFiles` implementations from drifting (the Qwen one started as a
// near-copy of DeepSeek's).

export interface AttachInput {
  path: string
  name: string
  mime: string
}

export interface AttachPayload {
  name: string
  mimeType: string
  buffer: Buffer
}

/**
 * Read every file into a Playwright `setFiles` payload. A file that cannot be
 * read is pushed onto `failed` (with a notice through `onReadError`) instead of
 * throwing, so a single unreadable file never aborts the whole attach. Returns
 * the successfully read payloads.
 */
export async function readAttachBuffers(
  files: AttachInput[],
  onReadError: (name: string, error: string) => void,
): Promise<{
  payload: AttachPayload[]
  failed: Array<{ path: string; name: string }>
}> {
  const payload: AttachPayload[] = []
  const failed: Array<{ path: string; name: string }> = []
  for (const f of files) {
    try {
      const buffer = await fs.readFile(f.path)
      payload.push({ name: f.name, mimeType: f.mime, buffer })
    } catch (e) {
      failed.push({ path: f.path, name: f.name })
      onReadError(f.name, (e as Error).message)
    }
  }
  return { payload, failed }
}

/** Minimal page surface the upload-preview wait needs (Playwright Locator). */
export interface PreviewPage {
  waitForTimeout(ms: number): Promise<void>
  getByText(
    text: string,
    opts?: { exact?: boolean },
  ): { count(): Promise<number> }
}

/**
 * Wait for the upload preview (the attached-file chip above the input) to
 * appear, instead of a fixed sleep. The signal is the FILE NAME showing up on
 * the page: files are attached BEFORE the text is typed, so the name cannot
 * appear there for any other reason. `timeoutMs` is the ceiling, so a build
 * where the name is not detected behaves exactly like the old fixed sleep.
 */
export async function awaitUploadPreview(
  page: PreviewPage,
  names: string[],
  timeoutMs: number,
): Promise<void> {
  const clean = names.map((n) => String(n || '').trim()).filter(Boolean)
  if (!clean.length) {
    await page.waitForTimeout(timeoutMs)
    return
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const name of clean) {
      // The lookup itself can THROW synchronously (Playwright: "Execution
      // context was destroyed" while the page navigates). `.catch` handles a
      // rejected promise, not a synchronous throw — without the try/catch the
      // error escaped into `_attachFiles` and the whole attach failed. A
      // lookup error means "not visible yet", exactly like a failed count.
      //
      // `exact: true`: a SUBSTRING match found a short/common name (`a`,
      // `image`) in unrelated page text and returned instantly, before the
      // upload started. The chip carries the FULL name.
      const n = await Promise.resolve()
        .then(() => page.getByText(name, { exact: true }).count())
        .catch(() => 0)
      if (n > 0) return
    }
    await page.waitForTimeout(150)
  }
}
