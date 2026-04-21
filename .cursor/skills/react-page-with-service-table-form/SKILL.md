---
name: react-page-with-service-table-form
description: Generate complete React page components with useState/useEffect, axios calls from service modules, and form + table UI. Use when the user asks to create a page, list page, CRUD page, management page, or any React page under src/pages and src/services.
---

# React Page With Service + Form + Table

## 何时使用

当用户提出以下需求时使用本技能：
- 创建页面
- 新增页面
- 列表页 / 管理页 / CRUD 页
- 需要表单和表格的页面

## 强制规则

1. 必须输出完整 React 组件（可直接放入 `src/pages`）。
2. 必须使用 `useState` 与 `useEffect`。
3. 必须通过 `src/services` 中的方法发起 axios 请求。
4. 页面必须包含：
   - 表单 UI（新增/筛选/编辑至少一种）
   - table UI（列表展示）
5. 文件结构必须符合：
   - `src/pages`
   - `src/services`
6. 禁止：
   - 直接使用 `fetch`
   - 写死 API URL（例如 `http://...` 或 `https://...`）

## 输出流程

1. 创建/更新 `src/services/<module>Service.(js|ts)`：
   - 仅封装接口调用函数
   - 使用 axios 实例或统一 API 客户端
2. 创建/更新 `src/pages/<PageName>.(jsx|tsx)`：
   - 完整页面组件
   - `useState` 管理表单、列表、加载状态
   - `useEffect` 在初次渲染时拉取数据
   - 表单提交后刷新列表
3. 若接口路径不明确：
   - 使用相对路径占位（如 `/api/v1/items`）
   - 不要写死域名

## 代码要求

- 组件至少包含以下状态：
  - 列表数据（如 `items`）
  - 表单数据（如 `form`）
  - 加载状态（如 `loading`）
- `useEffect` 必须调用列表查询方法。
- 所有请求调用必须来自 service（页面不直接写 axios 请求细节）。
- 处理基础异常（`try/catch` + 错误提示）。

## 推荐模板（按需调整）

```tsx
// src/services/itemService.ts
import api from './apiClient';

export const getItems = () => api.get('/api/v1/items');
export const createItem = (payload: { name: string }) => api.post('/api/v1/items', payload);
```

```tsx
// src/pages/ItemPage.tsx
import { useEffect, useState } from 'react';
import { createItem, getItems } from '../services/itemService';

type Item = { id: number; name: string };

export default function ItemPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState({ name: '' });
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await getItems();
      setItems(res.data?.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createItem(form);
    setForm({ name: '' });
    fetchItems();
  };

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input
          value={form.name}
          onChange={(e) => setForm({ name: e.target.value })}
          placeholder="Name"
        />
        <button type="submit">Save</button>
      </form>

      <table>
        <thead>
          <tr><th>ID</th><th>Name</th></tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={2}>Loading...</td></tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.name}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

## 生成前自检

- [ ] 组件是否是完整页面组件？
- [ ] 是否同时使用了 `useState` 和 `useEffect`？
- [ ] axios 调用是否全部来自 `src/services`？
- [ ] 是否包含“表单 + table”？
- [ ] 是否没有 `fetch`？
- [ ] 是否没有写死 API URL？
