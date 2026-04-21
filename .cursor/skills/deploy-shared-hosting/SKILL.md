---
name: deploy-shared-hosting
description: Provide deployment steps for this project on shared hosting. Use when the user asks about deploy, go live, hosting setup, build release, .htaccess, cPanel, or production publish.
---

# Deploy Shared Hosting

## When to apply

Apply this skill whenever the task involves deployment, production release, or hosting setup.

Trigger terms include: deploy, deployment, build, dist, shared hosting, cPanel, `.htaccess`, go live.

## Mandatory deployment outputs

When deployment is requested, always provide all of these:

1. `npm run build`
2. `dist` upload target: `/public_html/app/`
3. PHP API target: `/api/v1/`
4. `.htaccess` configuration

Do not omit any item.

## Required deployment flow

Follow this order:

1. Build frontend with:
   - `npm run build`
2. Upload build artifacts:
   - Source: `dist/`
   - Destination: `/public_html/app/`
3. Deploy backend API files:
   - Destination: `/api/v1/`
4. Apply `.htaccess` rules for SPA routing and API passthrough.
5. Verify site and API endpoints are reachable on shared hosting.

## `.htaccess` baseline template

Use this as default and adjust paths only when required by hosting structure:

```apache
RewriteEngine On

# 避免仅访问域名根路径时出现 403（根目录无 index 且禁止列目录）
RewriteRule ^$ /app/index.html [L]

RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

RewriteCond %{REQUEST_URI} ^/api/v1/ [NC]
RewriteRule ^ - [L]

RewriteRule ^ /app/index.html [L]

DirectoryIndex app/index.html index.html
```

## Shared hosting compatibility checks

Always ensure these conditions are met:

- Frontend static files are served from `/public_html/app/`
- API files are served from `/api/v1/`
- `.htaccess` is enabled and `mod_rewrite` works
- Direct API requests (for example `/api/v1/health.php`) are not routed to React
- Refreshing deep links in React does not return 404
- 访问站点根 `https://example.com/` 不应出现 **403**（需在 `.htaccess` 将空路径指到 `/app/index.html`，并设置 `DirectoryIndex` 兜底）

## Response format for deployment tasks

When answering deployment requests, structure output with:

1. Build command
2. File upload mapping
3. `.htaccess` content
4. Final verification checklist

Keep instructions actionable for shared hosting operators.
