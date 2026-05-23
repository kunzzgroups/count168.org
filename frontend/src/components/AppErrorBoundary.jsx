import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("AppErrorBoundary", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "Inter, 'Segoe UI', sans-serif",
            background: "#f8fafc",
          }}
        >
          <div
            style={{
              maxWidth: 520,
              width: "100%",
              padding: 24,
              borderRadius: 12,
              border: "1px solid #fecaca",
              background: "#fff",
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
            }}
          >
            <h1 style={{ margin: "0 0 12px", fontSize: 20, color: "#0f172a" }}>页面加载失败</h1>
            <p style={{ margin: "0 0 12px", color: "#b91c1c" }} role="alert">
              {msg}
            </p>
            <p style={{ margin: 0, color: "#64748b", fontSize: 14, lineHeight: 1.5 }}>
              请按 F12 打开开发者工具，查看 Console 里的红色报错。若刚部署过前端，请确认已上传完整的{" "}
              <code>frontend/dist</code> 文件夹（含 <code>index.html</code> 与 <code>assets/</code> 里同名 JS）。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
