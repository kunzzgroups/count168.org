import axios from 'axios'
import { API_BASE_URL } from '@/config/api'

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
  return config
})

/** Same-origin PHP scripts at site root (e.g. login). Sends cookies for session. */
export const siteHttp = axios.create({
  withCredentials: true,
  headers: { Accept: 'application/json' },
})
