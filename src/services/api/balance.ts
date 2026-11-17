import { API_ORIGIN, ApiError, request } from './client.js'

/** 账户余额（官方 /user/balance，不计费，不消耗 token） */
export type Balance = {
  /** 总余额 */
  total: number
  /** 充值余额 */
  topUp: number
  /** 赠送额度，可能为 0 */
  granted: number
  currency: string
}

type BalanceInfo = {
  currency?: unknown
  total_balance?: unknown
  topped_up_balance?: unknown
  granted_balance?: unknown
}

/** 接口里的金额是字符串；缺失或异常一律按 0 处理，避免整张卡片显示 NaN */
const toAmount = (value: unknown): number => {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(amount) ? amount : 0
}

export const fetchBalance = async (apiKey: string, signal?: AbortSignal): Promise<Balance> => {
  const response = await request(`${API_ORIGIN}/user/balance`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  const body = (await response.json()) as { balance_infos?: BalanceInfo[] }
  const info = body.balance_infos?.[0]
  if (!info) {
    throw new ApiError('protocol', 'balance info missing', response.status)
  }
  return {
    total: toAmount(info.total_balance),
    topUp: toAmount(info.topped_up_balance),
    granted: toAmount(info.granted_balance),
    currency: typeof info.currency === 'string' ? info.currency : 'CNY',
  }
}
