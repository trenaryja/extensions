# Hearsay

Dictation for VS Code. Press one key and talk — each sentence lands at your cursor, in the commit message
box or chat input, or on the command line of the focused terminal, as soon as you pause. Everything runs on your machine: no account, no API
key, and no network once the model is on disk.

Hearsay exists for the machines where [Superwhisper](https://superwhisper.com) can't be installed but a
VS Code extension can. Where Superwhisper is installable, use it instead.

## Using it

|                                     |                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `cmd+alt+v` / `ctrl+alt+v`          | start dictating, and again to finish                                    |
| `escape`                            | drop the sentence in flight; earlier ones stay                          |
| the `$(mic)` status bar item        | the same toggle, clickable, red with a live level meter while recording |
| `Hearsay: Select Model`             | pick a model and download it right away                                 |
| `Hearsay: Import from Superwhisper` | copy Superwhisper's vocabulary and replacements into settings           |

Choosing a model downloads it into the extension's storage and verifies it by hash, and the first
dictation does the same for the default. Everything after that is offline.

Where the text goes is decided when you press the key, because only a keybinding can see what has
focus: the terminal, an input box such as the commit message, or else the editor. It stays there for the
whole recording, even if you click away. Starting from the status bar item or the command palette can't
see focus, so the text goes to the editor, or to the clipboard when no editor is open.

The terminal hands keys to the shell, so Hearsay adds its commands to
`terminal.integrated.commandsToSkipShell`. A value of your own there replaces that default — add
`hearsay.toggle` and `hearsay.cancel` to it, or the key goes to the shell instead.

## Models

Models are named by size, not by the Whisper weights behind them — which weights serve each size is an
implementation detail that can change.

| Model       | Setting value | Download | For                                                                |
| ----------- | ------------- | -------- | ------------------------------------------------------------------ |
| Extra small | `xs`          | 78 MB    | a machine that cannot keep up with anything else                   |
| Small       | `sm`          | 148 MB   | real time anywhere, including a CPU-only laptop                    |
| Medium      | `md`          | 190 MB   | **the default** — much better on technical vocabulary than Small   |
| Large       | `lg`          | 574 MB   | near the best accuracy there is; Apple Silicon or a strong desktop |
| Extra large | `xl`          | 1.6 GB   | the most accurate, sacrificing nothing                             |

Extra small through Medium are English-only and are better at English than a multilingual model of the
same size; Large and Extra large understand every language Whisper does. To run weights of your own, point
`hearsay.modelPath` at any ggml `.bin` — it overrides the tier and never downloads anything.

## Live text

Words appear in grey at the cursor while you are still saying them, and turn into real text when you
pause at the end of a sentence. A pause mid-sentence — trailing off to find the next word — keeps the
sentence grey until you finish it, so it lands as one sentence rather than two fragments. The preview is
a decoration, never document text, so Whisper is free to revise "recognize speech" into "wreck a nice
beach" mid-sentence with nothing to retract.

A committed sentence is final, and is one undo step — `cmd+z` takes back exactly the last one. `escape`
drops whatever has not committed yet. That trade is inherent to text that arrives as you speak: the only
way to review before anything lands is `hearsay.livePreview: off` plus a long `hearsay.silenceMs`.

The terminal and input boxes cannot be decorated, so dictating into them shows the preview in the status bar instead.

## Your words

Two settings teach Hearsay the words Whisper gets wrong, and both apply to the grey preview as well as
the committed text.

- **`hearsay.vocabulary`** — words spelled your way. Whisper is steered toward them, and anything it
  writes that differs only in spacing, case or punctuation is respelled: `claude md`, `ClaudeMD` and
  `Claude.md` all become `CLAUDE.md`. A word of eight letters or more also absorbs one slip
  (`Infiscal` → `Infisical`). Nothing looser — anything that sounds alike but is spelled differently
  is left alone, because on real recordings looser matching turned `suppression` into `Superwhisper`.
- **`hearsay.replacements`** — exact phrases to swap, for what the vocabulary cannot reach: a
  sound-alike (`in physical` → `Infisical`) or a real word you never mean (`clawed` → `Claude`).

`Hearsay: Import from Superwhisper` merges both from Superwhisper's settings, and leaves behind every
replacement the vocabulary already handles. The **Hearsay** output channel shows what Whisper heard
next to any sentence the dictionary changed.

## Settings

| Setting                       | Default |                                                                                     |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `hearsay.model`               | `md`    | which model transcribes — see Models above                                          |
| `hearsay.modelPath`           | —       | a ggml `.bin` you downloaded yourself; overrides `hearsay.model` and never fetches  |
| `hearsay.device`              | —       | exact input device name; empty means the system default                             |
| `hearsay.keepRecordings`      | `10`    | how many recordings to keep in `recordings/`; `0` deletes each one once transcribed |
| `hearsay.threads`             | `0`     | CPU threads for Whisper; `0` leaves one core free for the editor                    |
| `hearsay.language`            | `en`    | ISO 639-1 code, or `auto`. English-only models understand only `en`                 |
| `hearsay.vocabulary`          | `[]`    | words spelled your way — see Your words above                                       |
| `hearsay.replacements`        | `{}`    | exact phrases to swap, applied before the vocabulary                                |
| `hearsay.livePreview`         | `ghost` | `ghost` at the cursor, `status` in the status bar, or `off`                         |
| `hearsay.silenceMs`           | `500`   | pause that ends a sentence, on top of the voice detector's own 450 ms tail          |
| `hearsay.partialMs`           | `500`   | how often the sentence in flight is re-decoded for the preview                      |
| `hearsay.maxUtteranceSeconds` | `30`    | commit this far into a monologue even without a pause                               |
| `hearsay.chime`               | `true`  | a rising chime when recording starts, a falling one when it stops                   |

## Where things land

Everything lives under the extension's global storage — on macOS
`~/Library/Application Support/Code/User/globalStorage/trenaryja.hearsay/`.

|                  |                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `recordings/`    | one 16 kHz wav per recording, pruned to `hearsay.keepRecordings`. `Hearsay: Open Recordings Folder` reveals it |
| `models/`        | the downloaded ggml `.bin`                                                                                     |
| Output → Hearsay | a line per sentence — duration, where it was inserted, the text — and a line per recording                     |

## Requirements

Microphone access is granted to the app that hosts the extension — VS Code itself — so macOS asks on the
first dictation. Denied, it records digital silence rather than failing, so a transcript that comes back
empty is the symptom to look for.

Apple Silicon on macOS (Metal), x64 and arm64 on Windows, x64 on Linux.
