# 检查：为什么点击 Edit 后 Currency 会默认变成 MYR

## 1. 是否有「1SLOT / 账户 2130 的货币被设成 MYR」的配置？

**结论：没有。**

- **后端 API**（`api/accounts/account_currency_api.php`）：
  - `get_account_currencies` 只按 `account_currency` 表返回该账户**已关联的货币列表**。
  - 顺序是 `ORDER BY ac.created_at ASC`（按创建时间），**没有**「默认货币」或「优先 MYR」的逻辑。
  - 没有任何地方把「账户 2130 = MYR」写死。

- **前端**：
  - 没有 localStorage / sessionStorage 存「某账户上次选的货币」。
  - `loadFormData` 里的 `previousValue` 只用来**恢复上次选的账户**（Account 下拉），**不恢复 Currency**。
  - 没有任何配置或缓存写着「1SLOT 的 currency 是 MYR」。

所以：**不是**因为「别的地方已经设置过 1SLOT currency 是 MYR」才一直变 MYR。

---

## 2. 为什么会变成 MYR？

**原因在前端逻辑。**

在 `loadCurrenciesForAccount(accountId, preferredCurrency)` 里：

1. 拿到该账户的货币列表（API 返回 2 个，例如 MYR 和 JPY）。
2. 若有传入 **preferredCurrency**（例如 `"JPY"` 或 `"108"`），会优先在列表里匹配并选中该项。
3. **若没有传入 preferredCurrency，或匹配不到**，就会走「默认」分支：
   - 先找列表里有没有 **MYR**，有就选 MYR；
   - 没有 MYR 才选第一项。

因此：**只要某次调用 `loadCurrenciesForAccount(2130)` 时没有带上有效的 preferredCurrency（或带上了但没匹配到），就会选 MYR。**  
不是后端或数据库「指定 1SLOT = MYR」，而是前端「没收到/没用上行上已选货币，就默认 MYR」。

---

## 3. 控制台里 "Currency set to MYR (prioritized)" 说明什么？

当前仓库里的 `datacapturesummary.js` 里，对应逻辑打的日志是：

- `"Currency set to MYR (default)"`  
- **没有** `"Currency set to MYR (prioritized)"` 这段文案。

所以如果你在控制台仍看到 **"Currency set to MYR (prioritized)"**，说明浏览器跑的是**旧版本 JS**（缓存）。  
旧版本里没有「从当前编辑行取 preferredCurrency」的兜底，所以一旦某条调用路径没传 preferredCurrency，就会走默认 MYR。

---

## 4. 可能触发「没带 preferredCurrency」的调用路径

理论上会调用 `loadCurrenciesForAccount` 的地方：

1. **Account 的 change 监听**  
   - 用户改选账户，或某处对 account 触发了 `change`（例如 `refreshAccountList` 里 `dispatchEvent('change')`）。  
   - 若这条路径在**旧代码**里没传 preferredCurrency，就会变成 MYR。

2. **populateFormWithData（约 100ms 后）**  
   - 打开 Edit 弹窗、填表时，会用 `prePopulatedData` 里的 `currencyDbId` / `currency` 当 preferredCurrency 调用 `loadCurrenciesForAccount`。  
   - 若这里拿到的 preferredCurrency 为空（例如行上没 `data-currency-id`、或列索引不对），也会变成默认 MYR。

3. **loadCurrenciesForAccount 内部的「从当前行取货币」**  
   - 当前代码在「编辑模式 + 当前账户 = 该行账户」时，会从 `window.currentEditRow` 的 Currency 列（cells[3]）取 preferredCurrency。  
   - 若你跑的是**旧缓存**，这段逻辑不存在，所以即使上面两条没传，也不会从行上补。

---

## 5. 总结

| 问题 | 结论 |
|------|------|
| 有没有地方「设置 1SLOT currency 是 MYR」？ | **没有**。后端和前端都没有这种配置或缓存。 |
| 为什么界面会变成 MYR？ | 前端在「没有有效 preferredCurrency」时**默认选 MYR**。 |
| 为什么 preferredCurrency 会没有？ | 要么某条调用没传；要么行上没带上/没读到（列索引、data 等）；要么跑的是**旧 JS**，没有「从当前行取货币」的兜底。 |
| 控制台 "Currency set to MYR (prioritized)" 说明什么？ | 说明当前运行的是**旧版脚本**（缓存），需要强刷或清缓存后再试。 |

**建议：**

1. **强刷 / 清缓存**（Ctrl+Shift+R 或 Ctrl+F5），确保加载的是当前仓库里的最新 `datacapturesummary.js`。  
2. 再试一次：对「行上已是 JPY」的那行点 Edit，看弹窗里 Currency 是否保持 JPY。  
3. 若仍变 MYR，在控制台看同一时刻的 log：  
   `Loading currencies for account: 2130 preferredCurrency: ???`  
   - 若 preferredCurrency 为空或为 MYR，说明「从行上取」或「传入行上货币」的路径仍没生效，需要再对那条路径排查（例如列索引、`currentEditRow` 是否为空等）。

---

## 6. 补充排查（已强刷仍见 "Currency set to MYR (prioritized)"）

**结论：当前仓库里没有任何 `console.log` 会输出 "prioritized"。**

- 在 `js/datacapturesummary.js` 中搜索：
  - 实际打出「Currency set to MYR」的只有一行：`console.log('Currency set to MYR (default)');`（约第 2425 行）。
  - 文案是 **"(default)"**，不是 "(prioritized)"。
  - 字符串 **"prioritized"** 只出现在**注释**里（约 2231、2439、6672 行），不会出现在控制台。

因此：**若你在强刷后仍看到 "Currency set to MYR (prioritized)"，说明当时执行的 JS 不是当前仓库里的这份 `datacapturesummary.js`。**

可能原因（仅排查、不改代码）：

1. **访问的是别的环境**  
   例如：生产/预发服务器、另一台机器、另一分支部署的地址，上面的 `js/datacapturesummary.js` 仍是旧版（旧版里曾有 "prioritized"）。

2. **服务器或中间层缓存**  
   例如：Nginx / Apache / CDN 对 `datacapturesummary.js` 做了缓存，浏览器强刷后拿到的仍是旧文件。

3. **实际加载的路径不是当前工程**  
   例如：`<script src="js/datacapturesummary.js">` 被重写、或部署时替换成了别的文件/构建产物，导致运行的是旧逻辑。

**建议你再确认两件事（不改代码，只用于排查）：**

1. **"Currency set to MYR (prioritized)" 在控制台里的行号**  
   点开这条 log，看它标注的是 `datacapturesummary.js` 第几行。  
   - 当前仓库里打出 "Currency set to MYR" 的那行是 **2425**，且文案是 **(default)**。  
   - 若你看到的行号不是 2425，或点进去是 "(default)" 而控制台却显示 "(prioritized)"，都说明运行的脚本与当前仓库不一致。

2. **"Loading currencies for account: 2130" 的完整一行**  
   当前代码是：  
   `console.log('Loading currencies for account:', accountId, 'preferredCurrency:', preferredCurrency);`  
   请看这一行里 **preferredCurrency:** 后面显示的是什么（空、JPY、108 等）。  
   - 若是**空**：说明当时执行的逻辑里，没有把「行上已选货币」赋给 preferredCurrency（可能是旧版没有「从行取」的兜底，或 currentEditRow/列索引有问题）。  
   - 若有值（如 JPY）却仍选了 MYR：说明可能是匹配选项时出错（例如大小写、id/code 不一致）。
