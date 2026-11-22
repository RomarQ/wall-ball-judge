import type { HybridObject } from 'react-native-nitro-modules'

/** A display a scan found: a phone or a board that advertises the scoreboard service. */
export interface FoundDisplay {
  /** Its Bluetooth address, which `link` takes. */
  address: string
  /** Its Bluetooth name, or its address when it gives none. */
  name: string
  /** Its signal strength in dBm; the higher, the closer. */
  rssi: number
}

/**
 * The scoreboard link over Bluetooth Low Energy, as the repository's docs/scoreboard.md specifies it: a display's side,
 * which advertises the service and receives the score, and a judge's side, which finds a display and writes to it.
 */
export interface ScoreLink extends HybridObject<{ android: 'kotlin' }> {
  /**
   * Why this phone cannot take the display's side (`display`) or the judge's now: 'unsupported' without an adapter or,
   * for a display, an advertiser; 'denied' while a Nearby devices permission is missing; 'off' while Bluetooth is off;
   * '' when it can.
   */
  trouble(display: boolean): string

  /**
   * Advertises the service and serves `score` and `board` until `hideDisplay`, starting again whenever Bluetooth comes
   * back on. Each write reaches `onWrite` with the characteristic's last four digits, '6503' or '6504', and its bytes;
   * `onJudges` gets the number of connected phones that have written; `onTrouble` gets '' each time the display serves,
   * or why it does not: a `trouble` reason, or 'failed' with the system's code.
   */
  showDisplay(
    onWrite: (characteristic: string, bytes: number[]) => void,
    onJudges: (judges: number) => void,
    onTrouble: (trouble: string) => void,
  ): void
  /** Notifies a command payload to the judges that subscribed to `command`, and returns how many it reached. */
  command(bytes: number[]): number
  hideDisplay(): void

  /** Scans for `seconds` and returns the displays found, the strongest first. */
  findDisplays(seconds: number): Promise<FoundDisplay[]>
  /**
   * Links to the display at `address`, which a scan named `name`, and keeps the link until `unlink`: after a drop it
   * connects again, and finds the display by its name when the address no longer answers. `onState` gets 'linking',
   * 'linked' for a display that takes `board` and calls the reps, 'linked-score' for a display that takes `score` alone,
   * or 'lost'. `onCommand` gets each command payload the display notifies.
   */
  link(address: string, name: string, onState: (state: string) => void, onCommand: (bytes: number[]) => void): void
  /**
   * Hands the link the newest `board` and `score` payloads. It writes them one at a time, `board` first, keeps only the
   * newest, and writes them again after a reconnect; a display without `board` gets `score` alone.
   */
  send(board: number[], score: number[]): void
  unlink(): void
}
