package com.margelo.nitro.wallballvision

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise

/** The scoreboard link for JavaScript: at most one display served and one display linked. */
class HybridScoreLink : HybridScoreLinkSpec() {
  private val context: Context get() = NitroModules.applicationContext ?: error("no application context")
  private var display: DisplayServer? = null
  private var link: DisplayLink? = null
  /** Starts the display again when Bluetooth comes back on, and stops it when Bluetooth goes off. */
  private var bluetoothWatch: BroadcastReceiver? = null

  override fun trouble(display: Boolean): String {
    val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: return "unsupported"
    val needed = if (display) {
      listOf(Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT)
    } else {
      listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    }
    if (needed.any { context.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }) return "denied"
    if (!adapter.isEnabled) return "off"
    if (display && adapter.bluetoothLeAdvertiser == null) return "unsupported"
    return ""
  }

  override fun showDisplay(
    onWrite: (characteristic: String, bytes: DoubleArray) -> Unit,
    onJudges: (judges: Double) -> Unit,
    onTrouble: (trouble: String) -> Unit,
  ) {
    hideDisplay()
    val serve = {
      display?.stop()
      display = null
      val why = trouble(true)
      if (why.isEmpty()) {
        display = DisplayServer(
          context,
          onWrite = { which, bytes -> onWrite(which, DoubleArray(bytes.size) { (bytes[it].toInt() and 0xff).toDouble() }) },
          onJudges = { onJudges(it.toDouble()) },
          onStarted = onTrouble,
        ).also { it.start() }
      } else {
        onTrouble(why)
      }
    }
    val watch = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)) {
          BluetoothAdapter.STATE_ON -> serve()
          BluetoothAdapter.STATE_OFF -> {
            display?.stop()
            display = null
            onJudges(0.0)
            onTrouble("off")
          }
        }
      }
    }
    val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(watch, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(watch, filter)
    }
    bluetoothWatch = watch
    serve()
  }

  override fun command(bytes: DoubleArray): Double =
    (display?.send(ByteArray(bytes.size) { bytes[it].toInt().toByte() }) ?: 0).toDouble()

  override fun hideDisplay() {
    bluetoothWatch?.let { context.unregisterReceiver(it) }
    bluetoothWatch = null
    display?.stop()
    display = null
  }

  override fun findDisplays(seconds: Double): Promise<Array<FoundDisplay>> {
    val promise = Promise<Array<FoundDisplay>>()
    val why = trouble(false)
    if (why.isNotEmpty()) {
      promise.reject(IllegalStateException(why))
      return promise
    }
    DisplayScan.run(context, (seconds * 1000).toLong()) { promise.resolve(it.toTypedArray()) }
    return promise
  }

  override fun link(address: String, name: String, onState: (state: String) -> Unit, onCommand: (bytes: DoubleArray) -> Unit) {
    unlink()
    val commands = { bytes: ByteArray -> onCommand(DoubleArray(bytes.size) { (bytes[it].toInt() and 0xff).toDouble() }) }
    link = DisplayLink(context, address, name, onState, commands).also { it.open() }
  }

  override fun send(board: DoubleArray, score: DoubleArray) {
    link?.send(ByteArray(board.size) { board[it].toInt().toByte() }, ByteArray(score.size) { score[it].toInt().toByte() })
  }

  override fun unlink() {
    link?.close()
    link = null
  }
}
