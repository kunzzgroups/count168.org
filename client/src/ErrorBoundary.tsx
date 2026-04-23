import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { hasError: boolean; message: string }

/**
 * 未捕获的渲染/生命周期错误在默认情况下会导致白屏；在页面上直接显示便于线上排查。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message || String(err) }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[C168]', err, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            padding: '1.5rem',
            background: '#fef2f2',
            color: '#991b1b',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '36rem',
          }}
        >
          <h1 style={{ fontSize: '1.1rem', margin: '0 0 0.75rem' }}>应用加载失败</h1>
          <pre
            style={{
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {this.state.message}
          </pre>
          <p style={{ fontSize: '0.9rem', margin: '1rem 0 0' }}>
            请强制刷新 (Ctrl+F5)。若使用子路径部署，请确认 Vite{' '}
            <code>VITE_BASE_PATH</code> 与构建/上传路径一致；Nginx 站点需配置 SPA
            回退到 <code>index.html</code>。
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
