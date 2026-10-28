import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldRunWizard,
  initialWizardState,
  currentStep,
  chooseLanguage,
  chooseProvider,
  finishWizard,
  acceptDefaults,
  providerNote,
} from '../src/first-run.ts'

// N19: the first-run wizard. It must run ONLY on a fresh HOME in an
// interactive session, never block a scripted run, and Esc must always accept
// the defaults instead of trapping the operator in a modal.

test('the wizard runs only on a fresh, interactive install', () => {
  const base = {
    configExists: false,
    isTTY: true,
    nonInteractiveLogin: false,
    oneShot: false,
  }
  assert.equal(shouldRunWizard(base), true)
  assert.equal(shouldRunWizard({ ...base, configExists: true }), false)
  assert.equal(shouldRunWizard({ ...base, isTTY: false }), false)
  assert.equal(shouldRunWizard({ ...base, nonInteractiveLogin: true }), false)
  assert.equal(shouldRunWizard({ ...base, oneShot: true }), false)
})

test('the steps go language -> provider -> login -> done', () => {
  let s = initialWizardState()
  assert.deepEqual(currentStep(s), { kind: 'language' })
  s = chooseLanguage(s, 'en')
  assert.deepEqual(currentStep(s), { kind: 'provider' })
  s = chooseProvider(s, 'deepseek')
  assert.deepEqual(currentStep(s), { kind: 'login', provider: 'deepseek' })
  s = finishWizard(s)
  assert.deepEqual(currentStep(s), { kind: 'done' })
})

test('DeepSeek and GLM need a real sign-in, Qwen can start as a guest', () => {
  const base = chooseLanguage(initialWizardState(), 'ru')
  assert.equal(chooseProvider(base, 'deepseek').needsLogin, true)
  assert.equal(chooseProvider(base, 'glm').needsLogin, true)
  assert.equal(chooseProvider(base, 'qwen').needsLogin, false)
  // A guest provider has no login step: the wizard is done after the choice.
  assert.deepEqual(currentStep(chooseProvider(base, 'qwen')), {
    kind: 'done',
  })
})

test('Esc accepts the defaults and ends the wizard', () => {
  const s = acceptDefaults(initialWizardState())
  assert.equal(s.locale, 'en')
  assert.equal(s.provider, 'deepseek')
  assert.deepEqual(currentStep(s), { kind: 'done' })
})

test('every provider note names a real limitation', () => {
  assert.match(providerNote('deepseek'), /sign-in/)
  assert.match(providerNote('qwen'), /guest/)
  assert.match(providerNote('glm'), /captcha/)
})
