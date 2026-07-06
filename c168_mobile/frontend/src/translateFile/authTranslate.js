/** Maps English API `message` strings to localized text (login). */
const AUTH_API_MESSAGES = {
  "Account ID, Company ID or password is incorrect": {
    en: "Account ID, Company ID or password is incorrect",
    zh: "账号 ID、公司 ID 或密码不正确",
  },
  "Username or password is incorrect": {
    en: "Username or password is incorrect",
    zh: "用户名或密码不正确",
  },
  "Company or Group has expired.": {
    en: "Company or Group has expired.",
    zh: "公司或集团已过期。",
  },
  "Please enter account ID": {
    en: "Please enter account ID",
    zh: "请输入账号 ID",
  },
  "Please enter username": {
    en: "Please enter username",
    zh: "请输入用户名",
  },
  "Invalid request": {
    en: "Invalid request",
    zh: "无效请求",
  },
  "Database connection failed": {
    en: "Database connection failed",
    zh: "数据库连接失败",
  },
  "Database error, please try again later": {
    en: "Database error, please try again later",
    zh: "数据库错误，请稍后重试",
  },
  "An error occurred. Please try again.": {
    en: "An error occurred. Please try again.",
    zh: "发生错误，请稍后重试。",
  },
  Unauthorized: {
    en: "Unauthorized",
    zh: "未授权，请重新登录",
  },
};

const LOGIN_ERROR_PREFIX = "An error occurred during login:";

export function localizeAuthApiMessage(message, lang = "en") {
  const normalizedLang = lang === "zh" ? "zh" : "en";
  const text = String(message || "").trim();
  if (!text) return "";

  const mapped = AUTH_API_MESSAGES[text];
  if (mapped) return mapped[normalizedLang] || text;

  if (text.startsWith(LOGIN_ERROR_PREFIX)) {
    const detail = text.slice(LOGIN_ERROR_PREFIX.length).trim();
    return normalizedLang === "zh" ? `登录时发生错误：${detail}` : text;
  }

  return text;
}

export const LOGIN_I18N = {
  en: {
    admin: "Admin",
    member: "Member",
    companyPlaceholder: "Company / Group ID",
    accountPlaceholder: "Account Id",
    usernamePlaceholder: "Username",
    passwordPlaceholder: "Password",
    rememberMe: "Remember me",
    forgotPassword: "Forget Password?",
    login: "Login",
    loggingIn: "Logging in...",
    notice: "Notice",
    loginFailed: "Login failed",
    loginError: "An error occurred during login",
    loginBackendOffline:
      "Cannot reach PHP backend. From project root run: php -S localhost:8000",
    loginServerError: "Server error (HTTP {status}). Check PHP backend and database.",
    loginInvalidResponse: "Server returned an invalid response. Check local PHP and MySQL.",
    confirm: "Confirm",
    maintenanceLabel: "System Maintenance:",
    unknownError: "Unknown error",
  },
  zh: {
    admin: "管理员",
    member: "会员",
    companyPlaceholder: "公司 / 集团 ID",
    accountPlaceholder: "账号 ID",
    usernamePlaceholder: "用户名",
    passwordPlaceholder: "密码",
    rememberMe: "记住我",
    forgotPassword: "忘记密码？",
    login: "登录",
    loggingIn: "登录中...",
    notice: "提示",
    loginFailed: "登录失败",
    loginError: "登录时发生错误",
    loginBackendOffline: "无法连接 PHP 后端。请在项目根目录运行：php -S localhost:8000",
    loginServerError: "服务器错误 (HTTP {status})。请检查本地 PHP 与数据库。",
    loginInvalidResponse: "服务器返回异常。请检查 includes/config.php 与 MySQL。",
    confirm: "确认",
    maintenanceLabel: "系统维护中:",
    unknownError: "未知错误",
  },
};
