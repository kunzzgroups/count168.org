import { API_BASE_URL } from '@/config/api'

export function HomePage() {
  return (
    <section className="page home-page">
      <h1>Home</h1>
      <p>
        API base: <code>{API_BASE_URL}</code>
      </p>
    </section>
  )
}
