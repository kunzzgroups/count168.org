/** 与 `api/api_response.php` 约定一致 */
export type ApiResult<T> = {
  success: boolean
  message: string
  data: T
  error?: string
}
