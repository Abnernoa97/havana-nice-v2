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

@UnstableApi
class HavanaVideoCompressionModule : Module() {
  private data class Job(val id: String, val file: File, val transformer: Transformer, val promise: Promise)
  private var job: Job? = null

  private fun cancelActive(reason: String) {
    val active = job ?: return
    job = null
    try { active.transformer.cancel() } catch (_: Exception) {}
    active.file.delete()
    active.promise.reject("E_VIDEO_CANCELLED", reason, null)
  }

  override fun definition() = ModuleDefinition {
    Name("HavanaVideoCompression")

    AsyncFunction("compress") { input: String, output: String, id: String, shortSide: Int, promise: Promise ->
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
          .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(1_800_000).build())
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

    OnDestroy {
      Handler(Looper.getMainLooper()).post { cancelActive("Compresión interrumpida.") }
    }
  }
}
