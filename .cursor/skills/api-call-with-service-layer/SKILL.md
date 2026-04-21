---
name: api-call-with-service-layer
description: Enforce frontend API call conventions with axios service layer. Use when creating or editing React components, pages, services, or any code that calls backend APIs.
---

# API Call With Service Layer

## 何时使用

当用户需求涉及以下场景时，必须应用本技能：
- 新增或修改接口调用
- 编写 React 页面/组件并请求后端数据
- 重构前端请求逻辑
- 修复请求错误处理问题

## 强制规则

1. 必须使用 `axios` 发起请求。
2. 必须创建并使用 `src/services/api.js` 作为统一 API 客户端入口。
3. 必须使用 `async/await`（禁止 `.then/.catch` 链式写法作为主流程）。
4. 必须使用 `try/catch` 处理错误。
5. 组件或页面只能调用 service 方法，不能直接写请求细节。

## 禁止项

- 禁止在组件内直接写 API URL（如 `/api/v1/users`、`https://xxx.com/api/...`）。
- 禁止在组件内直接 `axios.get/post/...`。
- 禁止使用 `fetch` 代替 `axios`。

## 标准文件结构

- `src/services/api.js`：统一 axios 实例（baseURL、超时、拦截器可按项目需要配置）
- `src/services/<module>Service.js`：按模块封装接口方法
- `src/pages/*` 或 `src/components/*`：只调用 service 方法

## 实现流程

1. 若不存在 `src/services/api.js`，先创建 axios 实例文件。
2. 在 `src/services/<module>Service.js` 中封装接口函数。
3. 在组件中 `import` service 方法并用 `async/await` 调用。
4. 请求逻辑必须放在 `try/catch`，失败时返回或提示错误信息。

## 推荐模板

```js
// src/services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
});

export default api;
```

```js
// src/services/userService.js
import api from './api';

export async function getUsers() {
  const response = await api.get('/users');
  return response.data;
}

export async function createUser(payload) {
  const response = await api.post('/users', payload);
  return response.data;
}
```

```jsx
// src/pages/UserPage.jsx
import { useEffect, useState } from 'react';
import { getUsers } from '../services/userService';

export default function UserPage() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await getUsers();
        setUsers(data?.data || []);
      } catch (err) {
        setError(err?.message || '加载失败');
      }
    };

    loadUsers();
  }, []);

  if (error) return <div>{error}</div>;

  return <div>{users.length}</div>;
}
```

## 生成前自检

- [ ] 是否统一使用 `axios`？
- [ ] 是否存在并使用 `src/services/api.js`？
- [ ] 是否使用 `async/await`？
- [ ] 是否对请求使用了 `try/catch`？
- [ ] 组件内是否完全没有 API URL？
- [ ] 组件内是否完全没有直接 `axios` 调用？
