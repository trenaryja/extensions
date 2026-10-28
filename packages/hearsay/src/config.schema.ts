import { CATALOG, DEFAULT_MODEL_ID, megabytes, MODEL_IDS } from '@repo/hearsay-core'
import { setting } from '@repo/vscode-utils/config'
import { z } from 'zod'

/** Single source of truth for Hearsay settings — generates `contributes.configuration` and the typed accessor. */
export const configSchema = z.object({
	'hearsay.model': setting(z.enum(MODEL_IDS).default(DEFAULT_MODEL_ID), {
		markdownDescription:
			'The Whisper model that transcribes, downloaded once when chosen. Bigger is more accurate and slower — on Windows and Linux, where Hearsay runs on the CPU alone, Large and Extra large are far from real time.',
		// The catalog's own labels and notes, so the settings dropdown describes each model without a second copy.
		enumItemLabels: CATALOG.map((entry) => entry.label),
		markdownEnumDescriptions: CATALOG.map((entry) => `${megabytes(entry.bytes)} — ${entry.note}`),
		scope: 'machine',
	}),
	'hearsay.modelPath': setting(z.string().default(''), {
		markdownDescription:
			'Absolute path to a ggml `.bin` you downloaded yourself. Set this on a machine that cannot reach Hugging Face; it overrides `#hearsay.model#` and skips every download.',
		scope: 'machine',
	}),
	'hearsay.device': setting(z.string().default(''), {
		markdownDescription: 'Exact name of the input device to record from. Leave empty for the system default.',
		scope: 'machine',
	}),
	'hearsay.keepRecordings': setting(z.number().int().min(0).default(10), {
		markdownDescription:
			'How many recordings to keep in `recordings/`, pruned oldest-first after each one. `0` deletes each one as soon as it is transcribed. Reach the folder with **Hearsay: Open Recordings Folder**.',
		scope: 'machine',
	}),
	'hearsay.threads': setting(z.number().int().min(0).default(0), {
		markdownDescription:
			'How many CPU threads whisper may use. `0` leaves one core free for the editor, which is what keeps typing responsive while a recording is being decoded.',
		scope: 'machine',
	}),
	'hearsay.language': setting(z.string().default('en'), {
		markdownDescription:
			'Spoken language as an ISO 639-1 code, or `auto` to detect it. English-only models understand nothing else.',
		scope: 'window',
	}),
	'hearsay.vocabulary': setting(z.array(z.string()).default([]), {
		markdownDescription:
			'Words spelled your way: names, tools, jargon. Whisper is steered toward them, and anything heard that differs only in spacing, case or punctuation — `claude md`, `ClaudeMD` — is respelled to match. Long words also absorb a one-letter slip. **Hearsay: Import from Superwhisper** fills this in.',
	}),
	'hearsay.replacements': setting(z.record(z.string(), z.string()).default({}), {
		markdownDescription:
			'Exact phrases to swap, whole-word and case-insensitive, for what `#hearsay.vocabulary#` cannot reach: a sound-alike (`in physical` → `Infisical`) or a real word you never mean (`clawed` → `Claude`).',
	}),
	'hearsay.livePreview': setting(z.enum(['ghost', 'status', 'off']).default('ghost'), {
		markdownDescription:
			'How the words still being spoken are previewed before they commit. Nothing here reaches the document — the preview is replaced wholesale each time Whisper revises it.',
		markdownEnumDescriptions: [
			'Greyed-out text at the cursor. Falls back to the status bar when the terminal has focus, which cannot be decorated.',
			'The status bar only, in place of the level meter. Costs exactly what `ghost` does — it only moves where the words land.',
			'No preview, and no work done to produce one. The whole machine goes to committing text at each pause.',
		],
		scope: 'window',
	}),
	'hearsay.silenceMs': setting(z.number().int().min(100).default(500), {
		markdownDescription:
			'How long a pause ends an utterance and commits it. This is on top of the voice detector’s own 450 ms tail, so the real pause is about twice this. Lower commits sooner and splits sentences more often.',
		scope: 'window',
	}),
	'hearsay.partialMs': setting(z.number().int().min(100).default(500), {
		markdownDescription:
			'How often the utterance in flight is re-decoded for the preview. The helper never runs two decodes at once, so on a machine that cannot keep up this becomes a floor rather than a rate.',
		scope: 'window',
	}),
	'hearsay.maxUtteranceSeconds': setting(z.number().int().min(5).default(30), {
		markdownDescription:
			'Commit an utterance this long even if you never pause, so a monologue still reaches the document and the preview never has to re-decode a minute of audio.',
		scope: 'window',
	}),
	'hearsay.chime': setting(z.boolean().default(true), {
		markdownDescription: 'Play a short chime when recording starts and another when it stops.',
	}),
})
