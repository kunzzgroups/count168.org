export class ApiRequestError extends Error {
  readonly errorCode: string | undefined

  constructor(message: string, errorCode?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.errorCode = errorCode
  }
}
