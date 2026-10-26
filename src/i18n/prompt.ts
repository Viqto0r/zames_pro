// System-prompt fragments.
export const promptMessages: Record<string, { ru: string; en: string }> = {
  // AGENT-FACING: the model reads this, so neither locale may carry Cyrillic
  // prose (see AGENTS.md "Language policy"). Only the LANGUAGE NAME differs,
  // which is what actually steers the answer language.
  'prompt.answer_language': {
    ru: 'IMPORTANT: answer the operator in Russian. All text in the message field of the respond tool, and any explanations, must be in Russian.',
    en: 'IMPORTANT: answer the operator in English. All text in the message field of the respond tool, and any explanations, must be in English.',
  },
  // The hard "ONLY TOOL CALLS" block. All prose around a tool call is a
  // protocol violation: the operator never sees it (only tool calls and the
  // final respond reach the terminal), so it is pure pollution. We cannot
  // stop DeepSeek from generating it INSIDE its chat with code (that is the
  // model's output); we can only forbid it by prompt and hide it here.
  'prompt.only_tool_calls': {
    // AGENT-FACING: the model reads this, so BOTH locales carry the English
    // text (see AGENTS.md "Language policy"): a Russian operator still gets an
    // English protocol block, and the answer LANGUAGE is set separately above.
    ru: '## ONLY TOOL CALLS (hard rule)\n\nTalk to the operator ONLY through tool calls. Any plain text — explanations, plans, reasoning, comments, apologies, greetings, headings, lists, markdown, emoji — is FORBIDDEN. It is not read and counts as an error.\n\nYOUR ONLY OUTPUT is a tool call. Each turn contains exactly one JSON tool-call object (or an array of independent calls), with not a single word before or after.\n\nYou MUST NOT write: "I will now...", "let us look...", "let me check", plans, explanations, progress notes between steps.\n\nALLOWED: only a tool call and, at the very end, when the task is done, respond with the summary.\n\nThe only place where text is allowed is the message field inside respond, and only at the very end.',
    en: '## ONLY TOOL CALLS (hard rule)\n\nTalk to the operator ONLY through tool calls. Any plain text — explanations, plans, reasoning, comments, apologies, greetings, headings, lists, markdown, emoji — is FORBIDDEN. It is not read and counts as an error.\n\nYOUR ONLY OUTPUT is a tool call. Each turn contains exactly one JSON tool-call object (or an array of independent calls), with not a single word before or after.\n\nYou MUST NOT write: "I will now...", "let us look...", "let me check", plans, explanations, progress notes between steps.\n\nALLOWED: only a tool call and, at the very end, when the task is done, respond with the summary.\n\nThe only place where text is allowed is the message field inside respond, and only at the very end.',
  },
}
