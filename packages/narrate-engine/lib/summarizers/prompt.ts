export const buildPrompt = (
	text: string,
) => `Rewrite the passage below as a spoken summary: a short script that will be read aloud by a text-to-speech voice, so it has to work when heard rather than read.

Rules:
- Plain sentences only. No markdown, no headings, no bullet points, no numbered lists, no asterisks, no backticks.
- Do not reproduce code, tables, diagrams, or long identifiers. Describe what they do in words instead.
- Never say a commit hash, file path, filename, or file extension out loud. Refer to them descriptively instead: "the font metrics utilities", not "font-metrics.utils.ts".
- Between 60 and 120 words.
- Cover what the passage is about and what matters in it. Add nothing it does not say.
- Reply with the summary and nothing else.

Passage:
${text}`
