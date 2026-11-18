import { useState } from 'react'
import { ApiError, verifyApiKey } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { setApiKey } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'

/** 校验通过但本机没存住：这次能用，关掉页面就没了 */
type Failure = { cause: unknown } | { storage: true }

/** 输入 API Key 后先用 GET /models 校验，通过才保存 */
export const useApiKeyForm = (onSaved?: () => void, onNotStored?: () => void) => {
  const t = useTranslate()
  const [value, setValue] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const error =
    failure === null
      ? null
      : 'storage' in failure
        ? t('apiKeyStorageFailed')
        : classifyApiError(failure.cause) === 'unauthorized'
          ? t('apiKeyInvalid')
          : classifyApiError(failure.cause) === 'network'
            ? t('commonNetworkErrorToast')
            : t('apiKeyVerificationFailed', {
                message:
                  failure.cause instanceof ApiError && failure.cause.localMessage
                    ? t(failure.cause.localMessage.key, failure.cause.localMessage.params)
                    : failure.cause instanceof Error
                      ? failure.cause.message
                      : String(failure.cause),
              })

  const submit = async () => {
    const apiKey = value.trim()
    if (!apiKey || verifying) {
      return
    }
    setVerifying(true)
    setFailure(null)
    try {
      await verifyApiKey(apiKey)
      if (!setApiKey(apiKey)) {
        // Key 已经生效，但没写进本机存储：留着输入框和错误，让用户能自己复制走
        setFailure({ storage: true })
        onNotStored?.()
        return
      }
      setValue('')
      onSaved?.()
    } catch (e) {
      setFailure({ cause: e })
    } finally {
      setVerifying(false)
    }
  }

  return { value, setValue, verifying, error, submit }
}