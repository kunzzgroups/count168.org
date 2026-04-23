import axios from 'axios'
import { API_BASE_URL } from '@/config/api'
import { AUTH_TOKEN_STORAGE_KEY } from '@/config/auth'

export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

http.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    }
    return Promise.reject(err)
  },
)

/** Same-origin PHP scripts at site root (e.g. login). Sends cookies for session. */
export const siteHttp = axios.create({
  withCredentials: true,
  headers: { Accept: 'application/json' },
})
