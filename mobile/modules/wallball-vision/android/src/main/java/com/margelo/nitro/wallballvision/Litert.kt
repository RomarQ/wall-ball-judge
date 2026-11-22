package com.margelo.nitro.wallballvision

import android.content.Context
import com.google.ai.edge.litert.Accelerator
import com.google.ai.edge.litert.BuiltinNpuAcceleratorProvider
import com.google.ai.edge.litert.CompiledModel
import com.google.ai.edge.litert.Environment
import java.io.File

/** The CPU threads a model may use: 4 halve the pose's landmark model's time against 1 on a Pixel 11 Pro. */
private const val CPU_THREADS = 4

/** One LiteRT environment for the app's models, with the TPU registered when the phone has one, and how each unit opens a model. */
object Litert {
  @Volatile private var shared: Environment? = null

  fun environment(context: Context): Environment =
    shared ?: synchronized(this) {
      shared ?: Environment.create(context, BuiltinNpuAcceleratorProvider(context)).also { shared = it }
    }

  /**
   * How a model opens on `accelerator`: 4 threads on the CPU; on the GPU in half precision, with its compiled programs
   * kept in the app's cache under `cacheKey`, so only the first opening after an install compiles them. The key carries
   * the install's time, as a new build may ship another model under the same name.
   */
  /** When this build of the app was installed. A new build may ship another model under the same name. */
  fun installed(context: Context): Long = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime

  fun options(context: Context, accelerator: Accelerator, cacheKey: String): CompiledModel.Options =
    CompiledModel.Options(accelerator).apply {
      when (accelerator) {
        Accelerator.CPU -> cpuOptions = CompiledModel.CpuOptions(CPU_THREADS, null, null)
        Accelerator.GPU -> gpuOptions = CompiledModel.GpuOptions(
          precision = CompiledModel.GpuOptions.Precision.FP16,
          serializationDir = File(context.cacheDir, "litert-gpu").apply { mkdirs() }.path,
          modelCacheKey = "$cacheKey-${installed(context)}",
          serializeProgramCache = true,
        )
        else -> Unit
      }
    }
}
