/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Speed - Initial playback rate, e.g. 1.25. */
  "speed": string,
  /** Summarize with - Summarize & Play runs this CLI on your Mac and spends your tokens. Off means messages are only ever read in full. */
  "summarizer": "off" | "claude" | "opencode",
  /** Audio cache limit (MB) - Oldest clips are deleted after a narration to stay under this. 0 keeps everything. */
  "cacheLimitMb": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `recent-messages` command */
  export type RecentMessages = ExtensionPreferences & {}
  /** Preferences accessible in the `read-selection` command */
  export type ReadSelection = ExtensionPreferences & {}
  /** Preferences accessible in the `choose-voice` command */
  export type ChooseVoice = ExtensionPreferences & {}
  /** Preferences accessible in the `playback-status` command */
  export type PlaybackStatus = ExtensionPreferences & {}
  /** Preferences accessible in the `stop` command */
  export type Stop = ExtensionPreferences & {}
  /** Preferences accessible in the `speed-up` command */
  export type SpeedUp = ExtensionPreferences & {}
  /** Preferences accessible in the `slow-down` command */
  export type SlowDown = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `recent-messages` command */
  export type RecentMessages = {}
  /** Arguments passed to the `read-selection` command */
  export type ReadSelection = {}
  /** Arguments passed to the `choose-voice` command */
  export type ChooseVoice = {}
  /** Arguments passed to the `playback-status` command */
  export type PlaybackStatus = {}
  /** Arguments passed to the `stop` command */
  export type Stop = {}
  /** Arguments passed to the `speed-up` command */
  export type SpeedUp = {}
  /** Arguments passed to the `slow-down` command */
  export type SlowDown = {}
}

