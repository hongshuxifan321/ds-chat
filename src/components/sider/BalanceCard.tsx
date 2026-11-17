import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBalance, type Balance } from '../../services/api/balance.js'
import { classifyApiError } from '../../services/api/errors.js'
import { useChatStore } from '../../services/chat/store.js'
import { PLATFORM_LINKS } from '../../services/links.js'
import { useSettings } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'
import { openSettings } from '../settings/settingsDialogState.js'
import styles from './BalanceCard.module.css'

/** 60 秒内复用上一次结果；只存内存，金额不落盘 */
const CACHE_MS = 60_000

/** 跨组件实例共享，切换会话重建卡片时不必重新请求 */
let cache: { apiKey: string; at: number; balance: Balance } | null = null

/** 非零但不到一分钱时给三位小数，否则分会被抹成 0.00 */
const money = (value: number) =>
  value !== 0 && Math.abs(value) < 0.01 ? value.toFixed(3) : value.toFixed(2)

const symbol = (currency: string) => (currency.toUpperCase() === 'USD' ? '$' : '¥')

type Status = 'loading' | 'ok' | 'auth' | 'error'

/**
 * 侧边栏底部的余额：只有汉字和数字，没有图标与品牌名。
 * 未填 Key 时整块不渲染；点击金额刷新，旁边的「充值」去开放平台的充值页。
 */
export const BalanceCard = () => {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)

  const load = useCallback(
    async (force = false) => {
      if (!apiKey) {
        return
      }
      if (!force && cache?.apiKey === apiKey && Date.now() - cache.at < CACHE_MS) {
        setBalance(cache.balance)
        setStatus('ok')
        return
      }
      if (inFlight.current) {
        return
      }
      inFlight.current = true
      setRefreshing(true)
      try {
        const next = await fetchBalance(apiKey)
        cache = { apiKey, at: Date.now(), balance: next }
        setBalance(next)
        setStatus('ok')
      } catch (error) {
        setStatus(classifyApiError(error) === 'unauthorized' ? 'auth' : 'error')
      } finally {
        inFlight.current = false
        setRefreshing(false)
      }
    },
    [apiKey]
  )

  useEffect(() => {
    void load()
  }, [load])

  // 页面可见时每分钟兜底刷一次，回到前台立刻补刷
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void load()
      }
    }
    const timer = setInterval(refresh, CACHE_MS)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load])

  // 余额只在花钱时变：每轮回答结束后补一次，不等轮询
  useEffect(() => {
    let active = Object.keys(useChatStore.getState().streaming).length > 0
    return useChatStore.subscribe((state) => {
      const next = Object.keys(state.streaming).length > 0
      if (active && !next) {
        void load(true)
      }
      active = next
    })
  }, [load])

  if (!apiKey) {
    return null
  }
  const failed = status === 'auth' || status === 'error'
  return (
    <div className={styles.balance}>
      <button
        type="button"
        className={styles.main}
        // Key 无效时点了也没用，直接送去改
        onClick={() => (status === 'auth' ? openSettings('general') : void load(true))}
      >
        {failed ? (
          <span className={styles.error}>
            {t(status === 'auth' ? 'balanceInvalidKey' : 'balanceFailed')}
          </span>
        ) : (
          <span className={clsx(styles.row, refreshing && styles.refreshing)}>
            <span className={styles.label}>{t('balanceLabel')}</span>
            <span className={styles.value}>
              {balance ? `${symbol(balance.currency)}${money(balance.total)}` : t('balanceLoading')}
            </span>
          </span>
        )}
        {!failed && balance && balance.granted > 0 ? (
          <span className={styles.granted}>
            {t('balanceGranted', {
              amount: `${symbol(balance.currency)}${money(balance.granted)}`,
            })}
          </span>
        ) : null}
      </button>
      <a className={styles.topUp} href={PLATFORM_LINKS.topUp} target="_blank" rel="noreferrer">
        {t('balanceTopUp')}
      </a>
    </div>
  )
}
