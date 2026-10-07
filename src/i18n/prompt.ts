// System-prompt fragments.
export const promptMessages: Record<string, { ru: string; en: string }> = {
  'prompt.answer_language': {
    ru: 'ВАЖНО: отвечай оператору на русском языке. Весь текст в поле message инструмента respond, а также любые пояснения — на русском.',
    en: 'IMPORTANT: reply to the operator in English. All text in the respond tool message field, and any explanations, must be in English.',
  },
  'prompt.tools_header': {
    ru: 'You have access to the following tools:',
    en: 'You have access to the following tools:',
  },
  // The hard "ONLY TOOL CALLS" block. All prose around a tool call is a
  // protocol violation: the operator never sees it (only tool calls and the
  // final respond reach the terminal), so it is pure pollution. We cannot
  // stop DeepSeek from generating it INSIDE its chat with code (that is the
  // model's output); we can only forbid it by prompt and hide it here.
  'prompt.only_tool_calls': {
    ru: '## ТОЛЬКО ВЫЗОВЫ ИНСТРУМЕНТОВ (жёсткое правило)\n\nОбщайся с оператором ТОЛЬКО через вызовы инструментов. Любой обычный текст — объяснения, планы, рассуждения, комментарии, извинения, приветствия, заголовки, списки, markdown, эмодзи — ЗАПРЕЩЁН. Он не читается и считается ошибкой.\n\nТВОЙ ЕДИНСТВЕННЫЙ ВЫВОД — вызов инструмента. В каждом ответе ровно один JSON-объект вызова (или массив независимых вызовов), без единого слова до и после.\n\nНЕЛЬЗЯ писать: «сейчас сделаю», «давай посмотрим», «проверю», планы, объяснения, итоги между шагами.\n\nМОЖНО только вызов инструмента и, в самом конце, когда задача выполнена, respond с итогом.\n\nЕдинственное место, где допускается текст, — поле message внутри respond, и только в самом конце.',
    en: '## ONLY TOOL CALLS (hard rule)\n\nTalk to the operator ONLY through tool calls. Any plain text — explanations, plans, reasoning, comments, apologies, greetings, headings, lists, markdown, emoji — is FORBIDDEN. It is not read and counts as an error.\n\nYOUR ONLY OUTPUT is a tool call. Each turn contains exactly one JSON tool-call object (or an array of independent calls), with not a single word before or after.\n\nYou MUST NOT write: "I will now...", "let us look...", "let me check", plans, explanations, progress notes between steps.\n\nALLOWED: only a tool call and, at the very end, when the task is done, respond with the summary.\n\nThe only place where text is allowed is the message field inside respond, and only at the very end.',
  },
}
