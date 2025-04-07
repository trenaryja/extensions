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

export const commands: Record<string, { command: string; callback: () => Promise<string | void> }> = {
  'Multi-Cursor Magic: Format Months': {
    command: 'multiCursorMagic.formatMonths',
    callback: createCommand({
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

  'Multi-Cursor Magic: Format Days of Week': {
    command: 'multiCursorMagic.formatDaysOfWeek',
    callback: createCommand({
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

  'Multi-Cursor Magic: Format US States': {
    command: 'multiCursorMagic.formatUsStates',
    callback: createCommand({
      type: 'quick-pick',
      parseFn: parseUsState,
      parseError: 'One or more selections could not be parsed as a valid US State.',
      prompt: 'Select a US State format',
      quickPickItems: [{ label: 'Full' }, { label: '2-Letters' }] as const,
      transform: (state, _, option) => (option.label === 'Full' ? state.name : state.isoCode),
    }),
  },

  'Multi-Cursor Magic: Format Countries': {
    command: 'multiCursorMagic.formatCountries',
    callback: createCommand({
      type: 'quick-pick',
      parseFn: parseCountry,
      parseError: 'One or more selections could not be parsed as a valid Country.',
      prompt: 'Select a Country format',
      quickPickItems: [{ label: 'Full' }, { label: '2-Letters' }] as const,
      transform: (country, _, option) => (option.label === 'Full' ? country.name : country.isoCode),
    }),
  },

  'Multi-Cursor Magic: Format Numbers': {
    command: 'multiCursorMagic.formatNumbers',
    callback: createCommand({
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

  'Multi-Cursor Magic: Eval': {
    command: 'multiCursorMagic.evalDirect',
    callback: createCommand({
      type: 'direct',
      parseFn: (x) => x,
      transform: (selection) => eval(selection),
    }),
  },

  'Multi-Cursor Magic: Pad Start': {
    command: 'multiCursorMagic.padStart',
    callback: createCommand({
      type: 'input',
      parseFn: (x) => x,
      prompt: 'What character would you like to pad with?',
      transform: (selection, selections, input) =>
        selection.padStart(R.firstBy(selections, [(s) => s?.length ?? 0, 'desc'])?.length ?? 0, input),
    }),
  },
}
