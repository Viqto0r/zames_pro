// PURE inspection of z.ai's completion REQUEST body.
//
// WHY: GLM has no stable UI toggle for thinking / web search in the observed
// build — the flags travel in the request body that the SITE builds:
//   features.enable_thinking, features.web_search, features.auto_web_search,
//   features.preview_mode, features.flags[]
// (see test/fixtures/glm/completions-request.json — a real capture).
//
// Two of them MUST stay off, whatever the operator's thinking/search setting:
//   - preview_mode / the `general_agent` flag turn on z.ai's OWN agent runtime,
//     which emits its own tool calls and changes the answer format — that
//     breaks the zames tool-call protocol;
//   - image_generation likewise.
// So the provider VERIFIES the body it just sent and warns the operator
// instead of silently accepting a broken format.
//
// This module owns the knowledge; glm-browser.ts only wires it to the page.

/** The features object of a real completion request, as far as it matters. */
export interface GlmBodyFeatures {
  enableThinking?: boolean
  webSearch?: boolean
  autoWebSearch?: boolean
  previewMode?: boolean
  imageGeneration?: boolean
  flags: string[]
}

/** Read the features from a parsed completion body (tolerant of shapes). */
export function readGlmBodyFeatures(body: unknown): GlmBodyFeatures {
  const out: GlmBodyFeatures = { flags: [] }
  if (!body || typeof body !== 'object') return out
  const b = body as Record<string, unknown>
  const f = b.features
  if (!f || typeof f !== 'object') return out
  const feat = f as Record<string, unknown>
  if (typeof feat.enable_thinking === 'boolean') {
    out.enableThinking = feat.enable_thinking
  }
  if (typeof feat.web_search === 'boolean') out.webSearch = feat.web_search
  if (typeof feat.auto_web_search === 'boolean') {
    out.autoWebSearch = feat.auto_web_search
  }
  if (typeof feat.preview_mode === 'boolean') out.previewMode = feat.preview_mode
  if (typeof feat.image_generation === 'boolean') {
    out.imageGeneration = feat.image_generation
  }
  if (Array.isArray(feat.flags)) {
    out.flags = feat.flags.filter((x): x is string => typeof x === 'string')
  }
  return out
}

/**
 * PURE: the UNSAFE mode names that are ON in this body. An empty array means
 * the body is safe for the zames tool-call protocol.
 */
export function unsafeGlmModes(feat: GlmBodyFeatures): string[] {
  const bad: string[] = []
  if (feat.previewMode) bad.push('preview_mode')
  if (feat.imageGeneration) bad.push('image_generation')
  if (feat.flags.includes('general_agent')) bad.push('general_agent')
  return bad
}

/**
 * PURE: does the body match the operator's DESIRED thinking/search state?
 * Used to report a mismatch (the site decides the final body, so a UI flip
 * that did not take effect must be visible, not guessed).
 */
export function glmFlagsMismatch(
  feat: GlmBodyFeatures,
  want: { thinking: boolean; webSearch: boolean },
): string[] {
  const out: string[] = []
  if (typeof feat.enableThinking === 'boolean') {
    if (feat.enableThinking !== want.thinking) out.push('thinking')
  }
  const ws = feat.webSearch === true || feat.autoWebSearch === true
  if (want.webSearch !== ws) out.push('web_search')
  return out
}
