import type { ApiResult } from './api'

export type SecondaryStatusData = {
  needPassword?: boolean
  redirect?: string
}

export type VerifySecondaryData = {
  redirect?: string
}

export type SecondaryStatusResponse = ApiResult<SecondaryStatusData>
export type VerifySecondaryResponse = ApiResult<VerifySecondaryData>
