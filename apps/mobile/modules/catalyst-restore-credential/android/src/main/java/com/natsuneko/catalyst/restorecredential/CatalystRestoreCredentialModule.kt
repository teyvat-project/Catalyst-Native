package com.natsuneko.catalyst.restorecredential

import android.os.Build
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CreateRestoreCredentialRequest
import androidx.credentials.CreateRestoreCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetRestoreCredentialOption
import androidx.credentials.RestoreCredential
import androidx.credentials.exceptions.NoCredentialException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Credential Manager の Restore Credentials を JS から呼び出すための薄いラッパー。
 * 端末に保存された鍵は、Google のクラウドバックアップ経由で新しい端末へ引き継がれ、
 * 再ログイン操作なしでセッションを復元するために使われる。
 */
class CatalystRestoreCredentialModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CatalystRestoreCredential")

    // Restore Credentials は API 28 以降でのみ利用できる
    Function("isAvailable") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.P }

    AsyncFunction("createAsync") Coroutine { requestJson: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val credentialManager = CredentialManager.create(activity)

      // isCloudBackupEnabled = true で、クラウドバックアップ経由で新しい端末へ引き継がれる
      val response =
        credentialManager.createCredential(
          activity,
          CreateRestoreCredentialRequest(requestJson, true)
        )
      (response as CreateRestoreCredentialResponse).responseJson
    }

    AsyncFunction("getAsync") Coroutine { requestJson: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val credentialManager = CredentialManager.create(activity)

      try {
        val response =
          credentialManager.getCredential(
            activity,
            GetCredentialRequest(listOf(GetRestoreCredentialOption(requestJson)))
          )
        (response.credential as RestoreCredential).authenticationResponseJson
      } catch (_: NoCredentialException) {
        // 鍵がないのは異常ではないので、例外にせず null で JS 側へ伝える
        null
      }
    }

    AsyncFunction("clearAsync") Coroutine { ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CredentialManager.create(context)
        .clearCredentialState(
          ClearCredentialStateRequest(ClearCredentialStateRequest.TYPE_CLEAR_RESTORE_CREDENTIAL)
        )
    }
  }
}
