# count168 前端（React + Vite）

该项目前后端完全分离：

- 前端：React + Vite（`@vitejs/plugin-react`），构建产物输出到 `public_html/app`
- 后端：PHP API，路径为 `public_html/api/v1/*.php`
- 前端通过 axios 调用 `/api/v1/*` 接口，不直接耦合 PHP 页面

## 目录约定

- `frontend/`：React 源码
- `public_html/app/`：React build 后静态文件
- `public_html/api/v1/`：PHP API 接口

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 启动开发服务

```bash
npm run dev
```

3. 可选：配置 API 代理目标（默认 `http://127.0.0.1:8888`）

在 `frontend` 新建 `.env.local`：

```env
VITE_API_PROXY_TARGET=http://127.0.0.1:8888
```

## 打包发布

```bash
npm run build
```

打包结果会输出到：

- `public_html/app`

因此线上访问建议为：

- 前端页面：`/app/`
- PHP API：`/api/v1/...`

## 接口调用规范

- 统一通过 `src/services/api.ts`（axios 实例）发请求
- 组件/页面层不直接写 `axios.get/post` 细节
- API 路径统一使用相对路径（例如 `/api/v1/login.php`）

## 迁移旧 PHP 页面建议

如果你要把旧系统页面逐步迁移到 React，可按以下顺序：

1. 先保留原 PHP 页面和业务逻辑不动
2. 为每个页面补齐对应的 PHP JSON 接口（`public_html/api/v1/*.php`）
3. React 页面仅调用 API，不再渲染 PHP HTML
4. 页面迁移完成后，再下线旧 PHP 视图文件
