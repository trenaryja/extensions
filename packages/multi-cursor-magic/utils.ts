import { format, isValid, parse } from 'date-fns'
import * as vscode from 'vscode'

const getMonthExample = (formatStr: string) =>
  [...Array(12).keys()].map((x) => format(new Date(2000, x), formatStr)).join(', ')

export const monthFormats: (vscode.QuickPickItem & { formatStr: string })[] = [
  { label: 'Numeric', formatStr: 'M', detail: getMonthExample('M') },
  { label: 'Padded Numeric', formatStr: 'MM', detail: getMonthExample('MM') },
  { label: 'Abbreviated', formatStr: 'MMM', detail: getMonthExample('MMM') },
  { label: 'Full', formatStr: 'MMMM', detail: getMonthExample('MMMM') },
  { label: 'Narrow', formatStr: 'MMMMM', detail: getMonthExample('MMMMM') },
] as const

export const parseMonth = (input: string) => {
  const trimmedInput = input.trim()
  if (trimmedInput === '') return null

  // Try parsing as a number
  const num = Number(trimmedInput)
  if (!isNaN(num)) {
    const dateFromNumber = new Date(2000, num - 1, 1) // Months are 0-indexed in JavaScript
    if (isValid(dateFromNumber)) return dateFromNumber
  }

  // Array of possible date formats to try
  const dateFormats = ['MMMM', 'MMM', 'M'] as const
  for (const dateFormat of dateFormats) {
    const parsedDate = parse(trimmedInput, dateFormat, new Date())
    if (isValid(parsedDate)) return parsedDate
  }

  return null
}
