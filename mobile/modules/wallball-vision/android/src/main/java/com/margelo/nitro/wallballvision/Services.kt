package com.margelo.nitro.wallballvision

import android.content.Context
import android.net.Uri
import android.os.Environment
import android.content.ContentValues
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.speech.tts.TextToSpeech
import java.io.File
import java.io.FileOutputStream
import java.util.Locale
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sin

/** The settings, kept as the PWA keeps them in localStorage: strings under its keys. */
class Prefs(context: Context) {
  private val store = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

  fun get(key: String): String? = store.getString(key, null)
  fun set(key: String, value: String) = store.edit().putString(key, value).apply()

  /** Writes `value` to disk before it returns, for a mark that must outlive a crash right after it. */
  fun setNow(key: String, value: String) {
    store.edit().putString(key, value).commit()
  }
  fun remove(key: String) = store.edit().remove(key).apply()
}

private const val SAMPLE_RATE = 44_100

/** One tone: its start and length in seconds, frequency in hertz, gain, and its wave. */
class Tone(val start: Double, val length: Double, val frequency: Double, val gain: Double, val square: Boolean)

/** The board's sounds: tones as the PWA's tones.ts gives them, and the count spoken by the phone's own voice. */
class Sound(context: Context) : AutoCloseable {
  private val speech: TextToSpeech
  @Volatile private var speechReady = false

  init {
    speech = TextToSpeech(context.applicationContext) { status ->
      speechReady = status == TextToSpeech.SUCCESS
    }
  }

  /** Says `text` in the language `tag` names, dropping anything still being said. */
  fun say(text: String, tag: String, rate: Double) {
    if (!speechReady) return
    speech.language = Locale.forLanguageTag(tag)
    speech.setSpeechRate(rate.toFloat())
    speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, text)
  }

  /** Plays `tones`, each rising over `attack` seconds to its gain and falling exponentially to `floor` by its end. */
  fun tones(tones: List<Tone>, attack: Double, floor: Double) {
    val end = tones.maxOf { it.start + it.length }
    val samples = ShortArray((end * SAMPLE_RATE).toInt() + 1)
    for (tone in tones) {
      val first = (tone.start * SAMPLE_RATE).toInt()
      val count = (tone.length * SAMPLE_RATE).toInt()
      val gain = tone.gain
      val decay = ln(gain / floor) / (tone.length - attack)
      for (i in 0 until count) {
        val t = i.toDouble() / SAMPLE_RATE
        val level = if (t < attack) gain * t / attack else gain * exp(-decay * (t - attack))
        val phase = sin(2 * PI * tone.frequency * t)
        val wave = if (tone.square) (if (phase >= 0) 1.0 else -1.0) else phase
        val at = first + i
        samples[at] = (samples[at] + wave * level * Short.MAX_VALUE).toInt().coerceIn(-32768, 32767).toShort()
      }
    }
    val track = AudioTrack.Builder()
      .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(SAMPLE_RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
      .setTransferMode(AudioTrack.MODE_STATIC)
      .setBufferSizeInBytes(samples.size * 2)
      .build()
    track.write(samples, 0, samples.size)
    track.setNotificationMarkerPosition(samples.size)
    track.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
      override fun onMarkerReached(t: AudioTrack) = t.release()
      override fun onPeriodicNotification(t: AudioTrack) = Unit
    })
    track.play()
  }

  override fun close() = speech.shutdown()
}

/** The phone's videos and frames the app saves as pictures. Kept in an object: top-level functions in this module go unresolved on incremental builds. */
object Media {
  /** The video at `source`, as [Clip] opens it, or null when it is gone, unreadable or empty. */
  fun video(context: Context, source: String): VideoItem? {
    val retriever = MediaMetadataRetriever()
    return try {
      val name = if (source.startsWith("content://")) {
        val uri = Uri.parse(source)
        retriever.setDataSource(context, uri)
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) cursor.getString(0) else null
        } ?: ""
      } else {
        val file = clipFile(context, source)
        retriever.setDataSource(file.path)
        file.name
      }
      val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0
      if (durationMs > 0) VideoItem(source, name, durationMs) else null
    } catch (e: RuntimeException) {
      null
    } finally {
      retriever.release()
    }
  }

  /** The file `name` in the app's `clips` folder, where `adb push` puts the videos that replays and board checks judge. */
  fun clipFile(context: Context, name: String): File =
    File(context.getExternalFilesDir("clips") ?: error("no external files folder"), name)

  /** Saves an upright RGBA frame as a JPEG in the app's cache on shared storage, where `adb pull` reaches it, and returns its `file://` address. */
  fun saveJpeg(context: Context, frame: RgbaFrame, name: String): String {
    val bitmap = Bitmap.createBitmap(frame.width, frame.height, Bitmap.Config.ARGB_8888)
    frame.pixels.rewind()
    bitmap.copyPixelsFromBuffer(frame.pixels)
    frame.pixels.rewind()
    val file = File(context.externalCacheDir ?: context.cacheDir, name)
    FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it) }
    bitmap.recycle()
    return "file://${file.path}"
  }

  /** The folder under Movies where the app keeps the videos of live sets. */
  private const val VIDEO_FOLDER = "Wall Ball Judge"

  /**
   * Moves the recording `source` into the phone's Movies folder as `title`.mp4 and returns its content:// address, or ''
   * when the move fails, which leaves `source` as it was.
   */
  fun keepVideo(context: Context, source: File, title: String): String {
    val resolver = context.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, "$title.mp4")
      put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
      put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/$VIDEO_FOLDER")
      // Other apps see the video only once it is whole.
      put(MediaStore.Video.Media.IS_PENDING, 1)
    }
    val uri = resolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values) ?: return ""
    return try {
      resolver.openOutputStream(uri)!!.use { out -> source.inputStream().use { it.copyTo(out) } }
      resolver.update(uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
      source.delete()
      uri.toString()
    } catch (e: Exception) {
      resolver.delete(uri, null, null)
      ""
    }
  }

  /** Deletes the frames `saveJpeg` wrote under names that start with `prefix`. */
  fun clearFrames(context: Context, prefix: String) {
    (context.externalCacheDir ?: context.cacheDir).listFiles { file -> file.name.startsWith(prefix) && file.name.endsWith(".jpg") }
      ?.forEach { it.delete() }
  }
}
