# The two-phone link

In the Android app, a judging phone at the athlete's side or behind sends the board to a second phone that stands in front of the athlete, over Bluetooth Low Energy. The second phone, the display, shows the count large and calls each rep. This page is the contract between the two. [src/scoreboard-wire.ts](../src/scoreboard-wire.ts) encodes and decodes its payloads.

## Using it

On the phone in front of the athlete, open **Settings**, and under **Two phones** tap **Open** beside **This phone is the display**. On the judging phone, under **Two phones**, tap **Find a display**, then the display it lists. The first time, each phone asks for the **Nearby devices** permission. While a display is linked, it calls the reps and the judging phone stays silent. If the link drops, the judging phone links again on its own. Tap **Unlink** to end it.

## The link

### The GATT contract

Service `1889471f-b637-4c4a-9a7e-4e81ead26499`. A characteristic UUID is the service UUID with the last four digits replaced.

| Characteristic | Last four | Properties   | Payload, little-endian                          | Role               |
| -------------- | --------- | ------------ | ----------------------------------------------- | ------------------ |
| `score`        | `6503`    | read, write  | `count` u16, `noRep` u16. 4 bytes.              | display, **built** |
| `board`        | `6504`    | read, write  | the board and its last change. 18 bytes, below. | display, **built** |
| `command`      | `6505`    | read, notify | a display's Reset or division. 2 bytes, below.  | display, **built** |

The display advertises the service, and the judging phone's scan looks for the service UUID, so it lists displays only.

The judging phone writes with response, so a failed write is known to have failed. Writes go one at a time and only the newest is kept, because a display has no use for the history. On a reconnect the judging phone writes the current board again, so the display catches up.

### The `board` payload

A display that calls the reps needs more than the count: which change to call, the two kinds of no-rep, the clock, the division and the verdict's banner. The judging phone writes it to `board`, little-endian, in one write of 18 bytes, so the link never needs packets larger than Bluetooth's smallest. [src/scoreboard-wire.ts](../src/scoreboard-wire.ts) encodes and decodes it.

| Bytes | Field                                                                                                                                                                                                                                                           | Type |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 0     | version, 1                                                                                                                                                                                                                                                      | u8   |
| 1     | `seq`, the number of the last change, round from 255 to 0                                                                                                                                                                                                       | u8   |
| 2     | that change: 0 none, 1 rep, 2 target no-rep, 3 squat no-rep                                                                                                                                                                                                     | u8   |
| 3     | the plate it lit: 0 none, 1 men's, 2 women's                                                                                                                                                                                                                    | u8   |
| 4–5   | the count                                                                                                                                                                                                                                                       | u16  |
| 6–7   | the target no-reps                                                                                                                                                                                                                                              | u16  |
| 8–9   | the squat no-reps                                                                                                                                                                                                                                               | u16  |
| 10–13 | the set clock's reading when written, in milliseconds                                                                                                                                                                                                           | u32  |
| 14    | flags: 1 the clock runs, 2 reserved and never set, as a display of 0.30.4 or earlier reads it as a set done at 100 reps, 4 the women's target, 8 a banner, 16 the banner is a rep, 32 the ball was seen, 64 the set's first hit has not picked the division yet | u8   |
| 15    | the banner's reason: 0 none, 1 depth, 2 target                                                                                                                                                                                                                  | u8   |
| 16–17 | the banner's depth, in tenths of a percent of the femur's length                                                                                                                                                                                                | i16  |

`seq` moves only for a change to call. A write sent again, after a reconnect, a clock hold or a new division, keeps its number. The rules on each side:

- The judging phone writes `board` and then `score` after every change, one write at a time, keeping only the newest.
- The display calls a change whose number differs from the last one it drew. It never calls the first `board` it receives after it starts, because that change happened before. A judge that links again sends its last `board` with the same number, so the display calls nothing twice.
- Once a judge has written `board`, the display ignores its `score`. For a judge that writes `score` alone, the display calls a count that rises as a rep, and no-reps that rise as a no-rep.
- A display draws nothing from a `board` of a version it does not know.

### The `command` payload

The person at a display may clear the board or switch the division. The display cannot change the count itself, because the judging phone owns it, so it asks: it notifies `command` to the judging phones that subscribed to it, and each one does the command as if tapped on its own board, then writes `board` and `score` again. The display draws the change only when that write arrives.

| Bytes | Field                                                          | Type |
| ----- | -------------------------------------------------------------- | ---- |
| 0     | version, 1                                                     | u8   |
| 1     | the command: 1 Reset, 2 the men's target, 3 the women's target | u8   |

A judging phone ignores a command of a version or a code it does not know. A display offers the commands only to a judge that writes `board`, since a judge that writes `score` alone does not subscribe.

### The display

A web page cannot be the display: Web Bluetooth makes a page a GATT client and gives it no way to advertise. The Android app can, as `BluetoothLeAdvertiser` and `BluetoothGattServer` are the peripheral half of the same API. To be found and kept, a display must:

- **Advertise the service UUID**, because the scan looks for it and lists nothing else. The advertising packet holds 31 bytes, and the flags and a 128-bit UUID take 21 of them, so the name goes in the scan response rather than beside it. That name is the phone's own Bluetooth name, since Android's advertiser can only carry the adapter's.
- **Serve `score` and `board` as read and write**, and answer each write. The judging phone writes with a response and treats a failure as a failure, so a server that stays silent looks like a dead link and starts a reconnect.
- **Keep the screen awake**, since a display that sleeps mid-set shows nothing.

On Android 12 and later it needs the `BLUETOOTH_ADVERTISE` and `BLUETOOTH_CONNECT` permissions, both granted at runtime; on earlier versions, `BLUETOOTH` and `BLUETOOTH_ADMIN`. `BluetoothAdapter.getBluetoothLeAdvertiser()` returns null on a device that cannot advertise, which is the check worth making before anything else.
