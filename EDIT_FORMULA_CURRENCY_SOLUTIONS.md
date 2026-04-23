# Edit Formula 货币变 MYR 的解决方案

## 问题

点击 Edit 后弹窗里 Currency 变成 MYR，而不是行上已设置的货币（如 JPY）；选 JPY 保存后再 Edit 又变回 MYR。

---

## 方案一：已实现的逻辑（当前代码）

当前代码已做：

1. **点击 Edit 时保存行货币**：`window._editFormulaRowCurrency = { code: 'JPY', id: '108' }`，在 `loadCurrenciesForAccount` 和 `populateFormWithData` 里优先用这个值。
2. **loadCurrenciesForAccount 开头**：编辑模式且账户=行账户时，用 `_editFormulaRowCurrency` 或 DOM 的 cells[3] 赋 `preferredCurrency`。
3. **匹配选项前再兜底**：若 `preferred` 仍空，再试一次 `_editFormulaRowCurrency` 再匹配。
4. **关闭/非编辑时清理**：`closeEditFormulaForm` 和「非编辑打开」时清空 `_editFormulaRowCurrency`。

若仍出现 MYR，多半是**浏览器或服务器用了旧版 JS**（控制台仍出现 "Currency set to MYR (prioritized)" 即表示旧逻辑在跑）。

---

## 方案二：强制加载最新 JS（缓存破坏）

在 `datacapturesummary.php` 里给脚本加版本号，避免缓存旧文件：

```html
<script src="js/datacapturesummary.js?v=<?php echo time(); ?>"></script>
```

或固定版本，每次发版改一次：

```html
<script src="js/datacapturesummary.js?v=2"></script>
```

这样每次打开页面（或发版后）都会拉最新脚本，Edit 时就会用上「行货币优先」的逻辑。

---

## 方案三：编辑模式下不默认 MYR（可选）

若希望「编辑已有行时」绝不自动选 MYR，只有在**没有**行货币或**新增行**时才用 MYR，可以改 `loadCurrenciesForAccount` 的 else 分支：

- 当前：`preferredMatch` 找不到时 → 选 MYR，没有再选第一项。
- 可改为：**编辑模式且存在 `_editFormulaRowCurrency` 时**，若 `preferredMatch` 找不到（例如行上是 JPY 但该账户货币列表里没有 JPY），则**不选 MYR**，改为选第一项或保持「Select Currency」。

这样编辑时不会因为匹配失败而被强行设成 MYR。

---

## 建议执行顺序

1. **先做方案二**：在 `datacapturesummary.php` 给 `datacapturesummary.js` 加上 `?v=2`（或 `?v=<?php echo time(); ?>`），确认打开的是最新代码。
2. **再测**：对已设 JPY 的行点 Edit，看弹窗 Currency 是否保持 JPY；再测「选 JPY → Save → 再 Edit」是否仍为 JPY。
3. 若仍异常，再考虑**方案三**（编辑模式下不默认 MYR）。
