// N1 stage 2: the error families shared by the chat providers.
//
// Each provider used to declare its own copy (`QwenRateLimitError`,
// `GlmRateLimitError`, ...), so the retry policy in every `ask()` re-listed the
// same six families and a new one had to be added three times. The classes
// here are the SHARED vocabulary; the provider keeps its own pre-check
// (`instanceof`) only where the semantics genuinely differ (guest limits and
// the age gate exist on one backend only).
//
// `provider` is carried for the operator-facing message only — the retry
// decision is per CLASS, never per string.

export class ProviderRateLimitError extends Error {
  constructor(detail: string) {
    super('rate limit: ' + detail)
    this.name = 'ProviderRateLimitError'
  }
}

export class ProviderServerBusyError extends Error {
  constructor(detail: string) {
    super('server busy: ' + detail)
    this.name = 'ProviderServerBusyError'
  }
}

export class ProviderContextLimitError extends Error {
  constructor(detail: string) {
    super('context limit: ' + detail)
    this.name = 'ProviderContextLimitError'
  }
}

export class ProviderIncompleteError extends Error {
  constructor(detail: string) {
    super('generation incomplete: ' + detail)
    this.name = 'ProviderIncompleteError'
  }
}

export class ProviderGuestLimitError extends Error {
  constructor(detail: string) {
    super('guest limit: ' + detail)
    this.name = 'ProviderGuestLimitError'
  }
}

export class ProviderAgeGateError extends Error {
  constructor(detail: string) {
    super('age gate: ' + detail)
    this.name = 'ProviderAgeGateError'
  }
}

export class ProviderCaptchaError extends Error {
  constructor(detail: string) {
    super('captcha: ' + detail)
    this.name = 'ProviderCaptchaError'
  }
}
