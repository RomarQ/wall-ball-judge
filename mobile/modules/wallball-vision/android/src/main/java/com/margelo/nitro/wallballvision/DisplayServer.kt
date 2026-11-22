package com.margelo.nitro.wallballvision

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import java.util.UUID

/** The scoreboard service of the repository's docs/scoreboard.md and the characteristics a display serves. */
object Scoreboard {
  val SERVICE: UUID = UUID.fromString("1889471f-b637-4c4a-9a7e-4e81ead26499")
  val SCORE: UUID = UUID.fromString("1889471f-b637-4c4a-9a7e-4e81ead26503")
  val BOARD: UUID = UUID.fromString("1889471f-b637-4c4a-9a7e-4e81ead26504")
  val COMMAND: UUID = UUID.fromString("1889471f-b637-4c4a-9a7e-4e81ead26505")
  /** The standard descriptor through which a client turns a characteristic's notifications on and off. */
  val NOTIFY_SWITCH: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

  /** A characteristic's last four digits, as the contract names them. */
  fun shortName(uuid: UUID): String = uuid.toString().substring(32)
}

/**
 * The display's side of the link: it advertises the service, serves `score` and `board`, hands each write to `onWrite`,
 * and notifies `command` to the judges that subscribed. `onStarted` gets '' once it advertises, or why it does not. The
 * caller checks the permissions first.
 */
@SuppressLint("MissingPermission")
class DisplayServer(
  private val context: Context,
  private val onWrite: (characteristic: String, bytes: ByteArray) -> Unit,
  private val onJudges: (judges: Int) -> Unit,
  private val onStarted: (trouble: String) -> Unit,
) {
  private val manager = context.getSystemService(BluetoothManager::class.java)
  private val advertiser = manager?.adapter?.bluetoothLeAdvertiser
  private var server: BluetoothGattServer? = null
  /** What each characteristic last received, for a read. */
  private val values = mutableMapOf<UUID, ByteArray>()

  /**
   * The phones that have written and are still connected. A connection alone says nothing: a paired watch or headset
   * connects too, so only a write proves a judge.
   */
  private val judges = mutableSetOf<String>()

  /** The connected phones that subscribed to `command`, by address. */
  private val listeners = mutableMapOf<String, BluetoothDevice>()
  private var command: BluetoothGattCharacteristic? = null

  private val callback = object : BluetoothGattServerCallback() {
    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED) return
      synchronized(listeners) { listeners.remove(device.address) }
      changeJudges { judges.remove(device.address) }
    }

    override fun onDescriptorWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      descriptor: BluetoothGattDescriptor,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray,
    ) {
      if (descriptor.uuid == Scoreboard.NOTIFY_SWITCH) {
        synchronized(listeners) {
          if (value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)) listeners[device.address] = device
          else listeners.remove(device.address)
        }
      }
      if (responseNeeded) server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
    }

    override fun onDescriptorReadRequest(device: BluetoothDevice, requestId: Int, offset: Int, descriptor: BluetoothGattDescriptor) {
      val on = synchronized(listeners) { device.address in listeners }
      val value = if (on) BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE else BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
      server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, value)
    }

    override fun onCharacteristicReadRequest(device: BluetoothDevice, requestId: Int, offset: Int, characteristic: BluetoothGattCharacteristic) {
      val value = synchronized(values) { values[characteristic.uuid] } ?: ByteArray(0)
      val slice = if (offset in value.indices) value.copyOfRange(offset, value.size) else ByteArray(0)
      server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, slice)
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray,
    ) {
      // A judge writes with a response and takes silence for a dead link, so every write is answered.
      if (responseNeeded) server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
      synchronized(values) { values[characteristic.uuid] = value }
      changeJudges { judges.add(device.address) }
      onWrite(Scoreboard.shortName(characteristic.uuid), value)
    }
  }

  // The system answers on the main thread, so a start never waits for its answer there.
  private val advertising = object : AdvertiseCallback() {
    override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
      onStarted("")
    }

    override fun onStartFailure(errorCode: Int) {
      stop()
      onStarted("failed $errorCode")
    }
  }

  private fun changeJudges(change: () -> Boolean) {
    val count = synchronized(judges) { if (change()) judges.size else -1 }
    if (count >= 0) onJudges(count)
  }

  /** Starts serving and advertising; `onStarted` gets the answer. */
  fun start() {
    val advertiser = advertiser ?: return onStarted("unsupported")
    val gatt = manager?.openGattServer(context, callback) ?: return onStarted("failed: no GATT server")
    server = gatt
    val service = BluetoothGattService(Scoreboard.SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    for (uuid in listOf(Scoreboard.SCORE, Scoreboard.BOARD)) {
      service.addCharacteristic(
        BluetoothGattCharacteristic(
          uuid,
          BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE,
          BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE,
        ),
      )
    }
    val command = BluetoothGattCharacteristic(
      Scoreboard.COMMAND,
      BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      BluetoothGattCharacteristic.PERMISSION_READ,
    )
    command.addDescriptor(
      BluetoothGattDescriptor(Scoreboard.NOTIFY_SWITCH, BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE),
    )
    service.addCharacteristic(command)
    this.command = command
    gatt.addService(service)
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
      .setConnectable(true)
      .setTimeout(0)
      .build()
    // A 128-bit UUID and the flags take 21 of an advertisement's 31 bytes, so the name rides in the scan response.
    val advertisement = AdvertiseData.Builder().setIncludeDeviceName(false).addServiceUuid(ParcelUuid(Scoreboard.SERVICE)).build()
    val scanResponse = AdvertiseData.Builder().setIncludeDeviceName(true).build()
    advertiser.startAdvertising(settings, advertisement, scanResponse, advertising)
  }

  /** Notifies `value` on `command` to each judge that subscribed, and returns how many it reached. */
  fun send(value: ByteArray): Int {
    val server = server ?: return 0
    val command = command ?: return 0
    synchronized(values) { values[Scoreboard.COMMAND] = value }
    val devices = synchronized(listeners) { listeners.values.toList() }
    return devices.count { device ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        server.notifyCharacteristicChanged(device, command, false, value) == BluetoothStatusCodes.SUCCESS
      } else {
        @Suppress("DEPRECATION")
        command.value = value
        @Suppress("DEPRECATION")
        server.notifyCharacteristicChanged(device, command, false)
      }
    }
  }

  fun stop() {
    advertiser?.stopAdvertising(advertising)
    server?.close()
    server = null
    synchronized(judges) { judges.clear() }
    synchronized(listeners) { listeners.clear() }
  }
}
