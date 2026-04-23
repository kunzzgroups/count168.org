import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="page not-found-page">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </section>
  )
}
