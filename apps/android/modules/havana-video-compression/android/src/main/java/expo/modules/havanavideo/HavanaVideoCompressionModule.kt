package expo.modules.havanavideo

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.os.Handler
import android.os.Looper
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Dispatcher
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import okio.BufferedSink
import androidx.media3.transformer.AudioEncoderSettings

@UnstableApi
class HavanaVideoCompressionModule : Module() {
  private data class Job(val id: String, val file: File, val transformer: Transformer, val promise: Promise)
  private var job: Job? = null
  private data class RangeJob(val call: Call, val sent: AtomicLong)
  private val uploads = ConcurrentHashMap<String, RangeJob>()
  private val http = OkHttpClient.Builder()
    .dispatcher(Dispatcher().apply { maxRequests = 2; maxRequestsPerHost = 2 })
    .followRedirects(false).followSslRedirects(false)
    .retryOnConnectionFailure(false)
    .connectTimeout(15, TimeUnit.SECONDS)
    .writeTimeout(60, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .callTimeout(85, TimeUnit.SECONDS)
    .build()

  // Exactly the requested range, streamed from disk on OkHttp's I/O threads.
  // No temporary part files, JS buffers, base64, or per-part HTTP clients.
  private class RangeBody(
    private val file: File, private val offset: Long, private val length: Long,
    private val mime: String, private val sent: AtomicLong
  ) : RequestBody() {
    override fun contentType() = mime.toMediaType()
    override fun contentLength() = length
    override fun writeTo(sink: BufferedSink) {
      sent.set(0)
      RandomAccessFile(file, "r").use { input ->
        input.seek(offset)
        val buffer = ByteArray(64 * 1024)
        var remaining = length
        while (remaining > 0) {
          val count = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
          if (count <= 0) throw IOException("Incomplete video range")
          sink.write(buffer, 0, count)
          remaining -= count.toLong()
          sent.addAndGet(count.toLong())
        }
      }
    }
  }

  private fun cancelActive(reason: String) {
    val active = job ?: return
    job = null
    try { active.transformer.cancel() } catch (_: Exception) {}
    active.file.delete()
    active.promise.reject("E_VIDEO_CANCELLED", reason, null)
  }

  override fun definition() = ModuleDefinition {
    Name("HavanaVideoCompression")

    AsyncFunction("compress") { input: String, output: String, id: String, shortSide: Int, bitrate: Int, promise: Promise ->
      if (job != null) {
        promise.reject("E_VIDEO_BUSY", "Ya se está comprimiendo otro video.", null)
        return@AsyncFunction
      }
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_VIDEO_CONTEXT", "No se pudo iniciar el compresor.", null)
        return@AsyncFunction
      }
      var target: File? = null
      try {
        val source = Uri.parse(input)
        require(source.scheme == "file" || source.scheme == "content")
        require(id.matches(Regex("[0-9a-fA-F-]{36}")))
        val destination = Uri.parse(output)
        require(destination.scheme == "file")
        val file = File(requireNotNull(destination.path)).canonicalFile
        require(file.parentFile == context.filesDir.canonicalFile)
        require(file.name == "hn-v2-chat-pending-" + id + "-optimized.mp4")
        require(!file.exists())
        if (source.scheme == "file") require(File(requireNotNull(source.path)).canonicalFile != file)
        target = file
        val encoder = DefaultEncoderFactory.Builder(context)
          .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(bitrate.coerceIn(500_000, 1_100_000)).build())
          .setRequestedAudioEncoderSettings(AudioEncoderSettings.Builder().setBitrate(96_000).build())
          .setEnableFallback(true)
          .build()
        val listener = object : Transformer.Listener {
          override fun onCompleted(composition: Composition, exportResult: ExportResult) {
            val active = job
            if (active?.id != id) return
            job = null
            if (!file.isFile || file.length() <= 0L) {
              file.delete()
              promise.reject("E_VIDEO_EMPTY", "La compresión produjo un archivo vacío.", null)
            } else promise.resolve(file.length().toDouble())
          }
          override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
            if (job?.id != id) return
            job = null
            file.delete()
            promise.reject("E_VIDEO_ENCODER", "No se pudo comprimir este video (" + exportException.errorCode + ").", exportException)
          }
        }
        val transformer = Transformer.Builder(context)
          .setVideoMimeType(MimeTypes.VIDEO_H264)
          .setAudioMimeType(MimeTypes.AUDIO_AAC)
          .setEncoderFactory(encoder)
          .addListener(listener)
          .build()
        val effect = Presentation.createForShortSide(shortSide.coerceIn(2,720))
        val edited = EditedMediaItem.Builder(MediaItem.fromUri(source))
          .setEffects(Effects(emptyList(), listOf(effect)))
          .build()
        job = Job(id, file, transformer, promise)
        transformer.start(edited, file.absolutePath)
      } catch (error: Exception) {
        val active = job
        if (active?.id == id) {
          job = null
          try { active.transformer.cancel() } catch (_: Exception) {}
        }
        target?.delete()
        promise.reject("E_VIDEO_START", "No se pudo preparar la compresión.", error)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("progress") { id: String ->
      val active = job
      if (active?.id != id) -1 else {
        val holder = ProgressHolder()
        if (active.transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) holder.progress else -1
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancel") { id: String ->
      if (job?.id == id) cancelActive("Compresión cancelada.")
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("uploadRange") { uri: String, url: String, token: String, mime: String, start: Double, length: Double, key: String, promise: Promise ->
      try {
        val context = requireNotNull(appContext.reactContext)
        val source = Uri.parse(uri)
        require(source.scheme == "file")
        val file = File(requireNotNull(source.path)).canonicalFile
        require(file.path.startsWith(context.filesDir.canonicalPath + File.separator) ||
          file.path.startsWith(context.cacheDir.canonicalPath + File.separator))
        require(file.isFile && start.isFinite() && length.isFinite())
        require(start == start.toLong().toDouble() && length == length.toLong().toDouble())
        val offset = start.toLong()
        val count = length.toLong()
        require(offset >= 0 && count > 0 && offset <= file.length() && count <= file.length() - offset)
        require(mime == "video/mp4" || mime == "video/quicktime")
        val endpoint = url.toHttpUrl()
        require(endpoint.isHttps && endpoint.host == "havana-nice-v2-dev.soloaplicaciones97.workers.dev")
        require(endpoint.encodedPath.matches(Regex("/api/chat/media/[0-9a-fA-F-]{36}/(content|parts/[0-9]+)")))
        require(endpoint.query == null && endpoint.username.isEmpty() && endpoint.password.isEmpty())
        val sent = AtomicLong(0)
        val request = Request.Builder().url(endpoint)
          .header("Authorization", "Bearer " + token)
          .put(RangeBody(file, offset, count, mime, sent)).build()
        val call = http.newCall(request)
        val active = RangeJob(call, sent)
        require(uploads.putIfAbsent(key, active) == null)
        val began = android.os.SystemClock.elapsedRealtime()
        call.enqueue(object : Callback {
          override fun onFailure(call: Call, e: IOException) {
            uploads.remove(key, active)
            promise.reject("E_VIDEO_UPLOAD", if (call.isCanceled()) "Transferencia cancelada." else "Conexión interrumpida.", null)
          }
          override fun onResponse(call: Call, response: Response) {
            response.use {
              uploads.remove(key, active)
              if (it.isSuccessful && sent.get() == count) {
                promise.resolve(mapOf("bytes" to count.toDouble(), "elapsedMs" to (android.os.SystemClock.elapsedRealtime() - began).toDouble()))
              } else promise.reject("E_VIDEO_HTTP", "Respuesta de subida: " + it.code, null)
            }
          }
        })
      } catch (e: Exception) {
        promise.reject("E_VIDEO_RANGE", "No se pudo preparar la transferencia nativa.", null)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("uploadProgress") { key: String -> uploads[key]?.sent?.get()?.toDouble() ?: 0.0 }
    AsyncFunction("cancelUpload") { key: String -> uploads[key]?.call?.cancel() }.runOnQueue(Queues.MAIN)

    OnDestroy {
      uploads.values.forEach { it.call.cancel() }
      Handler(Looper.getMainLooper()).post { cancelActive("Compresión interrumpida.") }
    }
  }
}
