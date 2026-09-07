# EazyCount Android 壳工程(c168_mobile/app)

把手机版网页 `https://count168.site/c168_mobile/frontend/dist/` 封装成 Android App。
方案:Capacitor 8 WebView 壳 + 远程 URL(`server.url`),登录 Cookie、SSE 实时推送与网页完全同源,后端零改动。

## 目录结构

```
app/
├─ capacitor.config.json   # 核心配置:指向线上手机版地址
├─ www/index.html          # 本地兜底页(断网时不会用到,仅作占位/重连入口)
├─ assets/                 # icon.png(1080²) + splash.png(2732²),改 logo 后跑 npm run splash
├─ keystore/               # eazycount.keystore 签名密钥(已 gitignore,勿删!)
├─ android/                # Cap add 生成的原生工程
│  ├─ keystore.properties  # 签名参数(已 gitignore)
│  └─ local.properties     # 本机 SDK 路径(已 gitignore,每台机器各写各的)
└─ make-splash.mjs         # 用 sharp 生成白底居中 logo 启动图
```

## 日常出包(二选一)

**A. 命令行(本机已配好 SDK + 签名):**

```bash
cd c168_mobile/app
npm run build:apk
# 产物: android/app/build/outputs/apk/release/app-release.apk
```

**B. Android Studio:**

```bash
cd c168_mobile/app
npm run open:android     # 打开 Android Studio
# 菜单 Build → Build App Bundle(s)/APK(s) → Build APK(s)
```

首次构建会下载 Gradle 和依赖,需要等几分钟。

## 发新版改什么

| 要改的东西 | 位置 |
|---|---|
| App 显示名 | `android/app/src/main/res/values/strings.xml` 的 `app_name` + `capacitor.config.json` 的 `appName` |
| 版本号 | `android/app/build.gradle` 的 `versionCode`(每次+1)/ `versionName` |
| 线上地址 | `capacitor.config.json` → `server.url`,以及 `www/index.html` 兜底页里的重连地址 |
| 包名 | 一般不改;要改则 `capacitor.config.json`、`android/app/build.gradle` 的 `applicationId`、`android/app/src/main/java/.../MainActivity.java` 的 package 行 |

改完记得 `npx cap sync android`(仅原生插件变化时需要,纯改配置后重新构建即可)。

## 签名信息(内部分发)

- 密钥:`keystore/eazycount.keystore`,别名 `eazycount`,密码 `eazycount2026`(记录在此,丢失可按下条重建)
- 重建命令:
  ```bash
  "/c/Program Files/Java/jdk-24/bin/keytool" -genkeypair -v \
    -keystore keystore/eazycount.keystore -alias eazycount \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass eazycount2026 -keypass eazycount2026 \
    -dname "CN=EazyCount, OU=Mobile, O=Count168, C=MY"
  ```
- ⚠️ 换签名后已安装用户必须卸载重装(签名不一致无法覆盖安装)。

## 新电脑环境搭建

1. 装 Node ≥ 20、JDK ≥ 17(或直接装 Android Studio,自带 JBR)
2. 装 Android Studio(或只装 cmdline-tools 并设 `ANDROID_HOME`)
3. `cd c168_mobile/app && npm i`
4. 按 `android/keystore.properties` 模板重建签名(或从旧机拷 `keystore/` 过去)
5. `npm run build:apk`

## 已做的定制

- **返回键**:有网页历史 → 网页后退;无历史 → 退出 App(`MainActivity.java`)
- **图标/启动屏**:由 `images/count_logo.png` 生成(87 个尺寸,含自适应图标)
- **主题色**:品牌蓝 `#2563EB` / 深蓝 `#1D4ED8`(`values/colors.xml`)
- **全面屏**:targetSdk 36 强制 edge-to-edge,手机版前端已用 `env(safe-area-inset-*)` 自适应,顶部栏/底部导航不会被遮
- **HTTPS only**:未开 cleartext,不支持 http 明文

## 已知取舍

- 纯远程 URL 壳:断网时显示 WebView 错误页,重连后刷新即可;不缓存网页资源
- 若日后要上 Google Play,纯套壳过审有风险,届时可切换为"dist 打包进 APK + 后端开 CORS"模式(改 `capacitor.config.json` 删掉 `server.url`,把 `frontend/dist` 内容拷进 `www/` 再 `npx cap sync`)
