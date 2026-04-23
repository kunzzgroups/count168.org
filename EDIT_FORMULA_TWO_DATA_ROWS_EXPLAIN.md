# 为什么 Edit Formula 里会显示「两行数据」？

## 现象

在 Edit Formula 弹窗里，Formula 下方、Save/Cancel 上方会有一块「数据」区域，里面出现**两行**，例如：

- 第一行：`[2] PT`、`[3] 6.00`、`[4] (MYR) 70.50`、`[5] 4.23`
- 第二行：`[2] PT`、`[3] 6.00`、`[4] (MYR) 498.85`、`[5] 29.93`

两行前两列相同（都是 PT、6.00），后两列数值不同（70.50 vs 498.85，4.23 vs 29.93）。

---

## 原因（当前逻辑）

这块「数据」是由 **`updateFormulaDataGrid()`**（约 3047 行）根据 **Data Capture 表格** 生成的：

1. 取当前编辑的 **Id Product**（来自弹窗里的 process 输入，例如 `G8:GAMEPLAY (M)- RSLOTS - 4DDMYMYR (T07)`）。
2. 在 **Data Capture 表**（`capturedTableBody`）里遍历**每一行**。
3. 对每一行取该行的 **id_product**（`data-id-product` 或 id_product 列），做 **normalizeIdProductText** 后和当前 Id Product 比较。
4. **只要某行「归一化后的 id_product」和当前 Id Product 一致**，就为这一行**新建一行容器**（`formula-data-grid-row`），并把该行里列序号 > 1 的单元格做成 `[列号] 值` 的小块（如 `[2] PT`、`[3] 6.00` 等）放进这一行。

因此：

- **Data Capture 表里有几行「匹配当前 Id Product」**，这里就会显示**几行**数据。
- 你看到两行，说明在 Data Capture 表里，有**两行**在比较时被算作「和当前 Id Product 相同」。

结合你截图里的表格：

- **Row 32**：`G8:Gameplay (M)- Rslots - 4DDMYMYR (T07)` → (MYR) 70.50、4.23  
- **Row 33**：`G8:Gameplay (M)- Rslots - AB4D55MYR (T38)` → (MYR) 498.85、29.93  

这两行都属于「G8:Gameplay (M)- Rslots」下的不同子项（4DDMYMYR (T07) 和 AB4D55MYR (T38)）。  
当前实现里，**normalizeIdProductText** 很可能把这两行的 id_product 都归成同一个（或与弹窗里的 Id Product 一致），于是两行都匹配，就各自生成一行数据，所以会出现「两个数据」（两行）。

---

## 总结

| 问题           | 答案                                                                 |
|----------------|----------------------------------------------------------------------|
| 为什么会显示两个数据？ | 因为 Data Capture 表里**有两条行**在「归一化 id_product」后与当前 Id Product 一致，所以公式数据区会为这两行各画一行。 |
| 数据从哪来？   | 来自 **Data Capture 表**（capturedTableBody），不是 Summary 表。     |
| 两行分别对应谁？ | 对应表里那两条匹配行（例如 Row 32 和 Row 33：4DDMYMYR (T07) 和 AB4D55MYR (T38)）。 |

这是**按当前设计**：同一 Id Product 下有多行（如主行 + 子行，或多种变体）时，公式区会把这些行的数据都列出来，方便你选不同行的列来写公式。

---

## 解决方案（仅方案说明，不改代码）

若希望不再出现「两行」或希望行为更清晰，可以考虑下面几种方向（需改 `updateFormulaDataGrid` 或相关逻辑时再实现）：

### 方案 A：只显示「当前编辑的那一行」对应数据

- **做法**：在 Summary 表点某行 Edit 时，弹窗的 Id Product 对应的是该行（如 4DDMYMYR (T07)）。在 `updateFormulaDataGrid` 里不用「归一化后与 Id Product 一致」匹配多行，改为只匹配 **与当前编辑行 id_product 完全一致** 的那一行（或只取 Summary 当前行的 id_product 去 Data Capture 表里找对应的一行）。
- **效果**：公式区只显示一行数据（当前编辑行在 Data Capture 里的那一行）。
- **注意**：若当前编辑的是「主行」而 Data Capture 里主行没有数据、只有子行有，要约定好显示主行还是某一条子行。

### 方案 B：收紧匹配规则，避免多行被当成「同一 Id Product」【已实现】

- **做法**：在 `updateFormulaDataGrid` 中不再使用 `normalizeIdProductText`（会只保留第一个 `(` 前的内容导致多行归一成同一值），改为按**完整 id_product** 比较：`(rowIdProduct || '').trim().toUpperCase()` 与 `(idProduct || '').trim().toUpperCase()` 相等才算匹配。
- **效果**：只有 Data Capture 表里**与当前编辑行 id_product 完全一致**（忽略大小写与首尾空格）的那一行会显示；例如编辑 4DDMYMYR (T07) 时只显示该行，不会再把 AB4D55MYR (T38) 也算进来，公式区只显示一行数据。
- **注意**：仅改动了公式数据区的匹配逻辑，其它仍使用 `normalizeIdProductText` 的地方未改。

### 方案 C：保留两行，但加上行标识，让用户分清是哪一行

- **做法**：不改「显示几行」的逻辑，只在每一行数据前加**行标签**（例如显示 id_product 子项名「4DDMYMYR (T07)」「AB4D55MYR (T38)」，或 Row 32 / Row 33）。
- **效果**：仍然显示两行，但用户能分清两行分别对应哪一条数据，减少困惑。
- **注意**：不减少行数，只改善可读性。

### 方案 D：让用户选择「只看哪一行」

- **做法**：在公式区上方加一个下拉或 Tab，例如「选择数据行：4DDMYMYR (T07) | AB4D55MYR (T38)」，选哪一行就只显示那一行的 [2][3][4][5] 等。
- **效果**：默认可以显示多行或默认选第一行，用户可主动切换查看/引用不同行。
- **注意**：需要一点 UI 和状态（当前选中的行）的改动。

---

## 建议

- 若**只想公式区里只出现一行**：优先考虑 **方案 A**（只显示当前编辑行）或 **方案 B**（收紧匹配）。
- 若**可以保留两行、但怕搞混**：优先考虑 **方案 C**（加行标识）。
- 若**希望保留多行且可切换**：考虑 **方案 D**（用户选择显示哪一行）。

确定采用哪一种后，再在 `updateFormulaDataGrid` 及相关逻辑里改代码实现即可。当前仅说明原因与方案，未改代码。
