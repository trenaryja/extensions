import { defineCommands } from '@repo/vscode-utils/registry'
import { getClosestTailwindColor, isDark, tailwindPalette } from '@trenaryja/ui'
import chroma from 'chroma-js'
import { format } from 'date-fns'
import * as R from 'remeda'

import {
	createCommand,
	getDayOfWeekExample,
	getMonthExample,
	parseCountry,
	parseDayOfWeek,
	parseMonth,
	parseUsState,
} from './utils'

export const commands = defineCommands([
	{
		command: 'multiCursorMagic.formatMonths',
		title: 'Multi-Cursor Magic: Format Months',
		handler: createCommand({
			type: 'quick-pick',
			parseFn: parseMonth,
			parseError: 'One or more selections could not be parsed as a valid month.',
			prompt: 'Select a month format',
			quickPickItems: [
				{ label: 'Numeric', description: 'M', detail: getMonthExample('M') },
				{ label: 'Padded Numeric', description: 'MM', detail: getMonthExample('MM') },
				{ label: 'Abbreviated', description: 'MMM', detail: getMonthExample('MMM') },
				{ label: 'Full', description: 'MMMM', detail: getMonthExample('MMMM') },
				{ label: 'Narrow', description: 'MMMMM', detail: getMonthExample('MMMMM') },
			] as const,
			transform: (date, _, option) => format(date, option.description),
		}),
	},

	{
		command: 'multiCursorMagic.formatDaysOfWeek',
		title: 'Multi-Cursor Magic: Format Days of Week',
		handler: createCommand({
			type: 'quick-pick',
			parseFn: parseDayOfWeek,
			parseError: 'One or more selections could not be parsed as a valid day of the week.',
			prompt: 'Select a day format',
			quickPickItems: [
				{ label: '1-Letter', description: 'EEEEE', detail: getDayOfWeekExample('EEEEE') },
				{ label: '2-Letters', description: 'EEEEEE', detail: getDayOfWeekExample('EEEEEE') },
				{ label: '3-Letters', description: 'EEE', detail: getDayOfWeekExample('EEE') },
				{ label: 'Full', description: 'EEEE', detail: getDayOfWeekExample('EEEE') },
			] as const,
			transform: (date, _, option) => format(date, option.description),
		}),
	},

	{
		command: 'multiCursorMagic.formatUsStates',
		title: 'Multi-Cursor Magic: Format US States',
		handler: createCommand({
			type: 'quick-pick',
			parseFn: parseUsState,
			parseError: 'One or more selections could not be parsed as a valid US State.',
			prompt: 'Select a US State format',
			quickPickItems: [{ label: 'Full' }, { label: '2-Letters' }] as const,
			transform: (state, _, option) => (option.label === 'Full' ? state.name : state.isoCode),
		}),
	},

	{
		command: 'multiCursorMagic.formatCountries',
		title: 'Multi-Cursor Magic: Format Countries',
		handler: createCommand({
			type: 'quick-pick',
			parseFn: parseCountry,
			parseError: 'One or more selections could not be parsed as a valid Country.',
			prompt: 'Select a Country format',
			quickPickItems: [{ label: 'Full' }, { label: '2-Letters' }] as const,
			transform: (country, _, option) => (option.label === 'Full' ? country.name : country.isoCode),
		}),
	},

	{
		command: 'multiCursorMagic.formatNumbers',
		title: 'Multi-Cursor Magic: Format Numbers',
		handler: createCommand({
			type: 'quick-pick',
			parseFn: (selection: string) => {
				const num = Number(selection)
				return isNaN(num) ? null : num
			},
			parseError: 'One or more selections could not be parsed as a number.',
			prompt: 'Select a number format',
			quickPickItems: [
				{ label: '+1', fmt: (n: number) => n + 1 },
				{ label: '-1', fmt: (n: number) => n - 1 },
				{ label: 'Fixed (1)', fmt: (n: number) => n.toFixed(1) },
				{ label: 'Fixed (2)', fmt: (n: number) => n.toFixed(2) },
				{ label: 'Fixed (3)', fmt: (n: number) => n.toFixed(3) },
				{ label: 'Floor', fmt: (n: number) => Math.floor(n) },
				{ label: 'Ceiling', fmt: (n: number) => Math.ceil(n) },
				{ label: 'Round', fmt: (n: number) => Math.round(n) },
				{ label: 'Absolute Value', fmt: (n: number) => Math.abs(n) },
				{ label: 'Truncate', fmt: (n: number) => Math.trunc(n) },
				{ label: 'Square Root', fmt: (n: number) => Math.sqrt(n) },
				{ label: 'Squared', fmt: (n: number) => n * n },
				{ label: 'Doubled', fmt: (n: number) => n * 2 },
				{ label: 'Natural Log', fmt: (n: number) => Math.log(n) },
				{ label: 'Exponential', fmt: (n: number) => n.toExponential() },
				{ label: 'Locale String', fmt: (n: number) => n.toLocaleString() },
				{ label: 'Toggle Sign', fmt: (n: number) => -n },
				{ label: 'Binary', fmt: (n: number) => n.toString(2) },
				{ label: 'Octal', fmt: (n: number) => n.toString(8) },
				{ label: 'Hexadecimal', fmt: (n: number) => n.toString(16).toUpperCase() },
			] as const,
			transform: (num, _, option) => option.fmt(num),
		}),
	},

	{
		command: 'multiCursorMagic.evalDirect',
		title: 'Multi-Cursor Magic: Eval',
		handler: createCommand({
			type: 'direct',
			parseFn: (x) => x,
			// eslint-disable-next-line no-eval
			transform: (selection) => eval(selection),
		}),
	},

	{
		command: 'multiCursorMagic.padStart',
		title: 'Multi-Cursor Magic: Pad Start',
		handler: createCommand({
			type: 'input',
			parseFn: (x) => x,
			prompt: 'What character would you like to pad with?',
			transform: (selection, selections, input) =>
				selection.padStart(R.firstBy(selections, [(s) => s?.length ?? 0, 'desc'])?.length ?? 0, input),
		}),
	},

	{
		command: 'multiCursorMagic.formatColors',
		title: 'Multi-Cursor Magic: Format Colors',
		handler: createCommand({
			type: 'quick-pick',
			parseFn: (selection: string) => {
				const tw = R.find(tailwindPalette, (c) => c.fullName === selection)
				if (tw) return chroma(tw.oklch)
				if (!chroma.valid(selection)) return null
				return chroma(selection)
			},
			prompt: 'Select a color format',
			quickPickItems: [
				{ label: '#hex', fmt: (c: chroma.Color) => c.hex('rgb') },
				{ label: '#hexa', fmt: (c: chroma.Color) => c.hex('rgba') },
				{ label: 'hex', fmt: (c: chroma.Color) => c.hex('rgb').slice(1) },
				{ label: 'hexa', fmt: (c: chroma.Color) => c.hex('rgba').slice(1) },
				{ label: 'css rgb', fmt: (c: chroma.Color) => c.css('rgb') },
				{ label: 'css hsl', fmt: (c: chroma.Color) => c.css('hsl') },
				{ label: 'css lab', fmt: (c: chroma.Color) => c.css('lab') },
				{ label: 'css lch', fmt: (c: chroma.Color) => c.css('lch') },
				{ label: 'css oklab', fmt: (c: chroma.Color) => c.css('oklab') },
				{ label: 'css oklch', fmt: (c: chroma.Color) => c.css('oklch') },
				{ label: 'is dark?', fmt: (c: chroma.Color) => (isDark(c.hex()) ? 'true' : 'false') },
				{ label: 'closest tailwind color', fmt: (c: chroma.Color) => getClosestTailwindColor(c.hex()).fullName },
			] as const,
			transform: (c, _selections, option) => option.fmt(c),
		}),
	},
])

export type CommandId = (typeof commands)[number]['command']
