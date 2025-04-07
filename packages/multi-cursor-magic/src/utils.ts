import { Country, State } from 'country-state-city'
import { format, isValid, parse } from 'date-fns'
import * as vscode from 'vscode'

export type Command<TParsed, TOption extends vscode.QuickPickItem> = {
  parseFn: (selection: string) => TParsed | null
  parseError?: string
} & (
  | {
      type: 'quick-pick'
      prompt: string
      quickPickItems: TOption[]
      transform: (selection: TParsed, selections: (TParsed | null)[], option: TOption) => string | number | boolean
    }
  | {
      type: 'input'
      prompt: string
      transform: (selection: TParsed, selections: (TParsed | null)[], input?: string) => string | number | boolean
    }
  | {
      type: 'direct'
      transform: (selection: TParsed, selections: (TParsed | null)[]) => string | number | boolean
    }
)

export const createCommand =
  <TParsed, TOption extends vscode.QuickPickItem>(command: Command<TParsed, TOption>) =>
  async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return vscode.window.showInformationMessage('No editor is active')
    if (editor.selections.length === 0) return vscode.window.showInformationMessage('No selections found')

    const parsedSelections = editor.selections.map((selection) => command.parseFn(editor.document.getText(selection)))
    if (parsedSelections.some((selection) => selection === null)) {
      const choice = await vscode.window.showErrorMessage(
        command.parseError ?? 'Unable to parse one or more selection',
        'Select Invalid',
        'Select Valid',
      )
      if (choice === 'Select Valid' || choice === 'Select Invalid') {
        editor.selections = editor.selections.filter((_, i) => {
          const isValid = parsedSelections[i] !== null
          return choice === 'Select Valid' ? isValid : !isValid
        })
      }
      return
    }

    const replaceSelections = (replacer: (parsedSelection: TParsed) => string) => {
      editor.edit((editBuilder) => {
        editor.selections.forEach((selection, index) => {
          const parsed = parsedSelections[index]
          if (parsed) editBuilder.replace(selection, replacer(parsed))
        })
      })
    }

    if (command.type === 'quick-pick') {
      const quickPickItem = await vscode.window.showQuickPick(command.quickPickItems, { placeHolder: command.prompt })
      if (!quickPickItem) return
      replaceSelections((parsed) => command.transform(parsed, parsedSelections, quickPickItem).toString())
    }

    if (command.type === 'input') {
      const input = await vscode.window.showInputBox({ prompt: command.prompt })
      replaceSelections((parsed) => command.transform(parsed, parsedSelections, input).toString())
    }

    if (command.type === 'direct') {
      replaceSelections((parsed) => command.transform(parsed, parsedSelections).toString())
    }
  }

export const parseMonth = (input: string) => {
  const now = new Date()
  for (const format of ['M', 'MM', 'MMM', 'MMMM'] as const) {
    const parsedDate = parse(input, format, now)
    if (isValid(parsedDate)) return parsedDate
  }
  return null
}

export const getMonthExample = (formatStr: string) =>
  [...Array(12).keys()].map((x) => format(new Date(2000, x), formatStr)).join(', ')

export const parseDayOfWeek = (input: string) => {
  const now = new Date()
  for (const format of ['EEE', 'EEEE', 'EEEEEE'] as const) {
    const parsedDate = parse(input, format, now)
    if (isValid(parsedDate)) return parsedDate
  }
  return null
}

export const getDayOfWeekExample = (formatStr: string) =>
  [...Array(7).keys()].map((x) => format(new Date(2000, 0, 2 + x), formatStr)).join(', ')

const US_STATES = State.getStatesOfCountry('US')
export const parseUsState = (input: string) => {
  const normalizedInput = input.toLowerCase()
  return (
    US_STATES.find(
      (state) => state.name?.toLowerCase() === normalizedInput || state.isoCode?.toLowerCase() === normalizedInput,
    ) ?? null
  )
}

const COUNTRIES = Country.getAllCountries()
export const parseCountry = (input: string) => {
  const normalizedInput = input.toLowerCase()
  return (
    COUNTRIES.find(
      (country) =>
        country.name?.toLowerCase() === normalizedInput || country.isoCode?.toLowerCase() === normalizedInput,
    ) ?? null
  )
}
