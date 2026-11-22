package com.margelo.nitro.wallballvision

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid

/** The longest wait between two tries to connect again. */
private const val RECONNECT_MAX_MS = 8_000L
/** How long a try to connect again scans for the display. */
private const val RESCAN_MS = 3_000L
private const val SUBSCRIBING = "subscribing"

/** The judge's side of the link: the scan for displays, and one display's link. The caller checks the permissions first. */
@SuppressLint("MissingPermission")
object DisplayScan {
  /** Scans for `ms` and hands `done` each display found, by address, with its name and strongest signal. */
  fun run(context: Context, ms: Long, done: (List<FoundDisplay>) -> Unit) {
    val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
    if (scanner == null) {
      done(emptyList())
      return
    }
    val found = linkedMapOf<String, FoundDisplay>()
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val address = result.device.address
        val name = result.scanRecord?.deviceName ?: result.device.name ?: address
        synchronized(found) {
          val seen = found[address]
          found[address] = FoundDisplay(address, name, maxOf(result.rssi.toDouble(), seen?.rssi ?: Double.NEGATIVE_INFINITY))
        }
      }
    }
    val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(Scoreboard.SERVICE)).build())
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
    scanner.startScan(filters, settings, callback)
    Handler(Looper.getMainLooper()).postDelayed({
      scanner.stopScan(callback)
      done(synchronized(found) { found.values.sortedByDescending { it.rssi } })
    }, ms)
  }
}

/**
 * A link to one display, kept until [close]: it connects, writes the newest payloads, and connects again after a drop.
 * Writes go one at a time, as GATT asks, `board` first; only the newest of each is kept.
 */
@SuppressLint("MissingPermission")
class DisplayLink(
  private val context: Context,
  private var address: String,
  private val name: String,
  private val onState: (String) -> Unit,
  private val onCommand: (ByteArray) -> Unit,
) {
  private val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
  private val main = Handler(Looper.getMainLooper())
  private val lock = Any()
  private var gatt: BluetoothGatt? = null
  private var score: BluetoothGattCharacteristic? = null
  private var board: BluetoothGattCharacteristic? = null
  private var latest = mapOf<String, ByteArray>()
  private var sent = mutableMapOf<String, ByteArray>()
  /** The write in flight: a characteristic's last four digits, or [SUBSCRIBING] while `command` is switched on. */
  private var writing: String? = null
  private var tries = 0
  private var closed = false

  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
        gatt.discoverServices()
        return
      }
      gatt.close()
      synchronized(lock) {
        if (this@DisplayLink.gatt === gatt) this@DisplayLink.gatt = null
        score = null
        board = null
        writing = null
        if (closed) return
      }
      onState("lost")
      retry()
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      val service = gatt.getService(Scoreboard.SERVICE)
      if (status != BluetoothGatt.GATT_SUCCESS || service?.getCharacteristic(Scoreboard.SCORE) == null) {
        gatt.disconnect()
        return
      }
      val calls = synchronized(lock) {
        score = service.getCharacteristic(Scoreboard.SCORE)
        board = service.getCharacteristic(Scoreboard.BOARD)
        // A display that was away draws nothing it was sent before, so everything goes again.
        sent.clear()
        tries = 0
        // GATT runs one operation at a time, so the subscription goes before the first write.
        service.getCharacteristic(Scoreboard.COMMAND)?.let { if (subscribe(gatt, it)) writing = SUBSCRIBING }
        board != null
      }
      onState(if (calls) "linked" else "linked-score")
      flush()
    }

    override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      synchronized(lock) { if (writing == SUBSCRIBING) writing = null }
      flush()
    }

    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      if (characteristic.uuid == Scoreboard.COMMAND) onCommand(value)
    }

    @Deprecated("Android before 13 calls this form")
    @Suppress("DEPRECATION")
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (characteristic.uuid == Scoreboard.COMMAND) onCommand(characteristic.value ?: return)
    }

    override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      synchronized(lock) {
        val which = Scoreboard.shortName(characteristic.uuid)
        if (status == BluetoothGatt.GATT_SUCCESS) latest[which]?.let { sent[which] = it }
        writing = null
      }
      flush()
    }
  }

  fun open() {
    onState("linking")
    connect()
  }

  fun send(board: ByteArray, score: ByteArray) {
    synchronized(lock) { latest = mapOf("6504" to board, "6503" to score) }
    flush()
  }

  fun close() {
    synchronized(lock) {
      closed = true
      gatt?.let {
        it.disconnect()
        it.close()
      }
      gatt = null
    }
    main.removeCallbacksAndMessages(null)
  }

  /** Connects to the display; while Bluetooth is off, no connection starts, and the link tries again later. */
  private fun connect() {
    val started = synchronized(lock) {
      if (closed) return
      val device: BluetoothDevice? = adapter?.takeIf { it.isEnabled }?.getRemoteDevice(address)
      gatt = device?.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
      gatt != null
    }
    if (!started) retry()
  }

  /**
   * Connects again after a wait that grows with each try. Each try scans for the display first: a phone that advertises
   * again does so from a new address, and a connection to an address nobody answers takes half a minute to fail.
   */
  private fun retry() {
    val delay = synchronized(lock) {
      tries += 1
      minOf(RECONNECT_MAX_MS, 250L shl minOf(tries, 5))
    }
    main.postDelayed({
      if (synchronized(lock) { closed }) return@postDelayed
      onState("linking")
      if (adapter?.isEnabled != true) return@postDelayed retry()
      DisplayScan.run(context, RESCAN_MS) { found ->
        val display = found.firstOrNull { it.address == address } ?: found.firstOrNull { it.name == name }
        if (display == null) return@run retry()
        address = display.address
        connect()
      }
    }, delay)
  }

  /** Switches `command`'s notifications on, and says whether the write of the switch started. */
  private fun subscribe(gatt: BluetoothGatt, command: BluetoothGattCharacteristic): Boolean {
    val switch = command.getDescriptor(Scoreboard.NOTIFY_SWITCH) ?: return false
    if (!gatt.setCharacteristicNotification(command, true)) return false
    val on = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      gatt.writeDescriptor(switch, on) == BluetoothStatusCodes.SUCCESS
    } else {
      @Suppress("DEPRECATION")
      switch.value = on
      @Suppress("DEPRECATION")
      gatt.writeDescriptor(switch)
    }
  }

  /** Writes the next payload the display lacks, `board` before `score`, unless a write is in flight. */
  private fun flush() {
    synchronized(lock) {
      val gatt = gatt ?: return
      if (writing != null) return
      val next = listOfNotNull(board?.let { "6504" to it }, score?.let { "6503" to it }).firstOrNull { (which, _) ->
        val value = latest[which]
        value != null && value.isNotEmpty() && !value.contentEquals(sent[which])
      } ?: return
      val (which, characteristic) = next
      val value = latest.getValue(which)
      val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gatt.writeCharacteristic(characteristic, value, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothStatusCodes.SUCCESS
      } else {
        @Suppress("DEPRECATION")
        characteristic.value = value
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        @Suppress("DEPRECATION")
        gatt.writeCharacteristic(characteristic)
      }
      if (started) writing = which
    }
  }
}
