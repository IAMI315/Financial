# Financial 首页二阶段改版技术实施计划

目标：以用户提供的最新首页目标图为视觉基准，在不推翻现有业务架构的前提下，分阶段完成首页内容区的第二轮改版。

范围：本轮只调整首页主体及其直接依赖的数据/API，不包含全局顶部搜索、通知中心、头像下拉、Sidebar 全量换肤。

当前基线提交：039721cba4be3bb94105e41773d5b4b2d3444107

---

## 1. 当前实现基线

当前首页主要涉及：

- apps/web/src/pages/HomePage.tsx
- apps/web/src/components/QuickEntry.tsx
- apps/web/src/components/DailyMustEntry.tsx
- apps/web/src/components/IncomeExpenseTrend.tsx
- apps/web/src/styles.css
- apps/web/src/types.ts
- apps/server/src/routes/stats.ts
- apps/server/src/routes/daily-must.ts
- packages/database/src/repositories.ts
- packages/database/src/schema.ts

已经具备：今日必记、早餐/中餐/晚餐默认模板、真实流水完成状态、快速记账、最近常用、一级/二级分类、本月收入/支出/结余、趋势和最近交易。因此第二阶段以视觉、交互、统计表达和页面密度优化为主。

---

## 2. 总体实施原则

整个改版拆成 8 个可独立实施、验证和提交的阶段：

1. 首页导航能力与统一分类图标
2. 今日必记与快速记账头部精修
3. 金额栏与计算器
4. 最近常用与分类区重构
5. 统计卡环比能力
6. 趋势图重构与月份切换
7. 最近交易重构
8. 响应式、页面密度与最终回归

每个阶段必须：
- 只修改本阶段范围；
- 完成后运行 pnpm check；
- 运行 git diff --check；
- 单独提交；
- API/数据库改动与纯视觉改动尽量拆开；
- 出现问题时能够单独回退当前阶段。

---

## 3. Phase 1：首页导航能力与统一分类图标

### 目标

让首页中的“更多”“全部分类”“查看更多”真正跳转到对应页面，同时建立一个可以被最近常用、一级分类、最近交易共同复用的图标体系。

### 3.1 App 页面跳转

当前 App.tsx 使用 page/setPage 控制页面，没有 Router。

修改 apps/web/src/App.tsx：
- 给 HomePage 传入 onNavigate；
- 将当前 Page 类型导出，或单独建立 HomeTargetPage 类型；
- HomePage 只需要知道 transactions、categories、stats 三个目标。

调用链：
App.setPage -> HomePage.onNavigate -> QuickEntry/onOpenCategories 或 RecentTransactions/onOpenTransactions。

### 3.2 CategoryIcon

新增文件：
apps/web/src/components/CategoryIcon.tsx

建议 props：
- categoryName
- type，可选
- size：sm / md / lg

不引入大型图标库，使用内联 SVG。

建议映射：
- 餐饮：刀叉
- 交通：汽车
- 购物：购物袋
- 居住：房屋
- 娱乐：游戏手柄
- 医疗：医疗箱
- 学习：书本
- 通讯：电话
- 生活缴费：账单
- 人情/礼物：礼盒
- 经营：硬币
- 工资：钱包
- 补贴：徽章/硬币
- 其他：网格

CSS 增加 category-icon 及不同 tone class，分类颜色固定，不随收支类型变化。

### 验收

- 最近常用、一级分类、最近交易能够复用同一个 CategoryIcon；
- 首页“查看更多”可进入流水；
- “全部分类”可进入分类管理；
- 现有侧栏和移动端导航不受影响。

---

## 4. Phase 2：今日必记与快速记账头部精修

### 4.1 删除快速记账“联网”

目标图没有“联网”标识。

修改 QuickEntry.tsx：
- 删除快速记账标题区 online-dot；
- 标题保留“快速记账”；
- 副标题保留“随手记录每一笔，让生活更清晰”。

### 4.2 今日必记视觉

业务逻辑不改，只修改 DailyMustEntry.tsx 和 styles.css。

目标：
- 今日必记高度约 190px；
- 内边距约 18px 16px；
- 三张卡横向等宽；
- 卡片最小高度约 116px；
- 标题 20~22px；
- 日期 12px；
- 完成数量绿色；
- 进度条位于标题右侧区域；
- 添加按钮弱化。

完成项：
- 浅绿背景；
- 绿色边框；
- 左上绿色勾；
- 图标绿色。

未完成项：
- 白色/浅蓝背景；
- 蓝灰边框；
- 空心圆；
- 蓝色图标。

### 4.3 支出/收入 segmented

保留 switchType 业务逻辑。

视觉调整：
- 高度约 48px；
- 灰蓝背景；
- 选中项白底、蓝色边框、蓝色文字、轻阴影；
- 未选中项不使用明显边框。

### 验收

- 今日必记成为快速记账首要视觉区域；
- 点击早餐/中餐/晚餐仍正常带入；
- CRUD、固定金额/最近金额、完成判断不退化。

---

## 5. Phase 3：金额栏与计算器

### 5.1 金额栏结构

当前只有金额输入。

改成：
money-row
- 左侧 money-field
- 右侧 calculator-trigger

目标视觉：
“¥ 0.00”位于左侧，右侧显示计算器图标和“计算器”。

### 5.2 新增计算器

新增：
- apps/web/src/components/AmountCalculator.tsx
- apps/web/src/utils/calculator.ts

V1 支持：
- 数字；
- 小数点；
- 加减乘除；
- 删除；
- 清空；
- 等于；
- 确认写回金额。

禁止使用 eval 或 new Function。

建议做纯 token parser 或明确的运算符解析。

PC 使用 popover；移动端后续可使用 bottom-sheet。

### 5.3 保留现有金额交互

必须继续保持：
- 最近常用/今日必记带入金额；
- 第一次点击金额输入框时自动清空带入值；
- 打开 Calculator 不触发清空；
- Calculator 确认后 amountFromCommon=false。

### 测试

至少覆盖：
- 12.5 + 3.8 = 16.30
- 20 - 6.25 = 13.75
- 4 × 2.5 = 10.00
- 10 ÷ 4 = 2.50
- 除零
- 非法表达式

---

## 6. Phase 4：最近常用与分类区重构

### 6.1 最近常用改成单列

最新目标图优先于此前的“两列”要求。

目标默认显示约 5 条：
- 图标
- 分类/二级分类
- 金额

修改 common-entry-list 为单列，保持每项单行。

### 6.2 最近常用图标

当前“收/支”文字圆标替换为 CategoryIcon。

保留：
- 收入浅绿行背景；
- 支出浅红行背景；
- 金额两位小数；
- 右键置顶；
- 手机长按置顶；
- 同类去重；
- 最近一次金额。

置顶状态可使用一个小 pin，不增加大段文字。

### 6.3 “更多”

QuickEntry 增加 showAllCommon。

默认前 5 条，点击“更多”展开到 8 条，再次点击“收起”。

不新增 API 请求。

### 6.4 一级分类标题

标题改为：
“一级分类                       全部分类 >”

QuickEntry 增加 onOpenCategories，由 HomePage 传入，最终调用 App.setPage('categories')。

### 6.5 一级分类图标化

现有三列保持。

每个按钮改成：
- CategoryIcon
- 分类名称
- 箭头

### 6.6 移除主网格“增加新分类”

目标图中没有“增加新分类”卡片。

建议：
- 从 QuickEntry 主网格移除；
- 新分类统一进入分类管理页；
- 快速记账只承担记账，不承担分类管理。

### 6.7 二级分类

不重写展开逻辑，只调整：
- 3 列；
- 统一图标；
- 至少可见 3 行；
- 内部滚动；
- 保留覆盖式展开。

### 验收

- 最近常用单列；
- 置顶/长按正常；
- 一级分类 3 列 + 图标；
- 二级分类不退化；
- 全部分类能进入分类页。

---

## 7. Phase 5：三张本月统计卡增加环比

### 7.1 API 扩展

当前 GET /api/stats/monthly?month=YYYY-MM 只返回当前月。

扩展为一次返回：
- 当前月 incomeFen / expenseFen / balanceFen；
- previous.month；
- previous.incomeFen / expenseFen / balanceFen；
- comparison.incomePercent；
- comparison.expensePercent；
- comparison.balancePercent。

避免首页为了环比再发第二条 HTTP 请求。

### 7.2 后端实现

修改 apps/server/src/routes/stats.ts。

增加：
- previousMonth(month)
- growthPercent(current, previous)

当前月和上月分别调用 getTransactionStatsForRange。

上月为 0：
- 当前也为 0 -> 0；
- 当前非 0 -> null；
- 前端显示“—”，不显示 Infinity。

### 7.3 前端类型

扩展 MonthlyStats：
- previous
- comparison

### 7.4 统计卡 UI

每张卡显示：
- 图标；
- 标题；
- 本月金额；
- “较上月 +X% ↑/↓”；
- 右下迷你柱图。

收入绿、支出红、结余蓝。

mini bars 不新增额外 API，使用当前月 dailyIncome/dailyExpense 生成视觉条即可；结余条为每日 income-expense。

### 测试

覆盖：
- 普通环比；
- 上月为 0；
- 本月为 0；
- 1 月到上一年 12 月。

---

## 8. Phase 6：趋势图重构与月份切换

### 8.1 重写为 SVG

当前 IncomeExpenseTrend 主要使用 div bar，无法表现目标图的：
- Y 轴；
- 水平网格线；
- 完整月份时间轴；
- 月份选择。

保留组件名，但内部改成 SVG。

建议结构：
- GridLines
- YAxis
- Bars
- XAxis

不引入 ECharts/Chart.js。

### 8.2 构造完整月份数据

新增 apps/web/src/utils/chart.ts。

buildMonthDailySeries(month, dailyIncome, dailyExpense) 输出当月每一天，即使某天没有数据也输出 0。

### 8.3 Y 轴

取收入/支出的最大值，然后 niceMax。

例如：
- 347 -> 400
- 612 -> 800
- 1680 -> 2000

显示 5 个刻度，金额单位为元。

### 8.4 X 轴

完整 28/29/30/31 天。

只显示部分标签：
1、5、10、15、20、25、30/31。

格式：
9/1、9/5、9/10 等。

### 8.5 月份切换

HomePage 增加 selectedMonth，默认 currentShanghaiMonth。

当前 loadDashboard 要拆成：
- loadHomeActivity：categories、dailyMust、commonEntries、recentTransactions；
- loadMonthlyStats(month)：只加载月度统计。

切月份时只调用 loadMonthlyStats，不重新请求今日必记、最近交易、分类和最近常用。

月份选择使用原生 input type=month，通过 CSS 包装成目标图右上“2026年9月 ▾”。

### 验收

- 切月份只新增 1 条 API 请求；
- 今日必记不随月份切换；
- 最近交易不随月份切换；
- 图表有 Y 轴、网格和完整 X 轴。

---

## 9. Phase 7：最近交易重构

### 9.1 标题

当前“最近 N 笔”改为“查看更多 >”。

点击进入流水页。

### 9.2 时间格式

新增 apps/web/src/utils/displayTime.ts。

formatRecentTransactionTime 输出：
- 今天 14:21
- 昨天 19:32
- 09/26 21:14

按上海时区判断。

### 9.3 分类列

使用 CategoryIcon。

显示：
图标 + 一级分类 · 二级分类。

### 9.4 金额

格式调整为：
- ¥ 12.50
+ ¥ 500.00

收入绿，支出红。

CSS 使用 tabular-nums，保证金额列对齐。

---

## 10. Phase 8：响应式、页面密度和最终回归

### 10.1 PC 尺寸

至少检查：
- 1920×1080
- 1680×1050
- 1536×864
- 1440×900
- 1366×768

目标：
- 左侧 QuickEntry 和右侧 Dashboard 总高度接近；
- 主要信息尽量在首屏；
- 不出现过大空白。

### 10.2 左右比例

当前 home-grid 左侧偏固定宽度。

最终建议使用比例式：
左侧约 50~52%，右侧约 48~50%。

可从：
minmax(660px, 1.05fr) / minmax(520px, .95fr)
开始测试，再根据实际浏览器截图调整。

### 10.3 Tablet

1260 以下单列保留，但 QuickEntry 与 Dashboard 应同宽并居中。

### 10.4 Mobile

功能优先：
- 今日必记横向滑动；
- 统计卡 3 小卡或横向滚动；
- 最近常用 1 列；
- 一级分类 2 列；
- 二级分类 2 列；
- 时间/备注 1 列；
- SVG 趋势图自适应；
- 最近交易隐藏备注列。

---

## 11. 测试计划

### 后端

stats integration 增加：
- 当前收入/支出/结余；
- 上月收入/支出/结余；
- 收入环比；
- 支出环比；
- 结余环比；
- 上月为 0；
- 跨年月份。

### 前端纯函数

覆盖：
- buildMonthDailySeries
- niceMax
- formatRecentTransactionTime
- calculator parser

### UI 手工回归

快速记账：
- 普通手工记账；
- 最近常用带入；
- 自动金额点击清空；
- 置顶/取消置顶；
- 长按置顶；
- 一级分类；
- 二级分类；
- 今日必记带入；
- 今日必记 CRUD；
- 今日完成状态；
- 重复交易确认；
- Calculator。

Dashboard：
- 空数据库；
- 只有支出；
- 只有收入；
- 收入支出都有；
- 30+ 天数据；
- 切换月份；
- 上月无数据；
- 最近交易长备注。

---

## 12. 性能约束

不能重新引入首页读取慢的问题。

必须保持：
- 最近交易只请求少量数据；
- 最近常用继续 limit；
- categories 不重复请求；
- 月份切换只刷新 monthly stats；
- 今日必记只查询当天；
- 不在首页加载全部流水；
- 趋势图只消费聚合统计数据。

目标：
- 首页初始 API 请求数量 <= 4~5；
- 切换月份新增 API 请求 = 1。

---

## 13. 建议最终文件结构

apps/web/src/components/
- AmountCalculator.tsx
- CategoryIcon.tsx
- DailyMustEntry.tsx
- IncomeExpenseTrend.tsx
- QuickEntry.tsx

apps/web/src/pages/
- HomePage.tsx

apps/web/src/utils/
- calculator.ts
- chart.ts
- displayTime.ts

apps/server/src/routes/
- daily-must.ts
- stats.ts

本轮先不拆 styles.css，避免视觉改版和 CSS 架构重构耦合。首页稳定后再单独考虑 styles/home.css、styles/quick-entry.css、styles/dashboard.css。

---

## 14. 推荐执行顺序

Step 1：CategoryIcon + HomePage 导航 callback
完成检查并提交。

Step 2：今日必记视觉 + segmented
完成检查并提交。

Step 3：金额栏 + Calculator
补单元测试，完成检查并提交。

Step 4：最近常用单列化 + 图标；一级分类图标化；更多/全部分类；移除主网格新增分类
完成检查并提交。

Step 5：stats API 增加 previous/comparison；三张统计卡重做
补 integration tests 并提交。

Step 6：HomePage selectedMonth；拆分数据加载；趋势图 SVG；Y轴/网格/X轴/月选择
完成检查并提交。

Step 7：最近交易图标/时间格式/查看更多
完成检查并提交。

Step 8：PC尺寸微调；Tablet/Mobile；完整回归
运行 pnpm check，提交最终视觉修订，然后发布 GHCR。

---

## 15. 建议 commit 命名

1. Add reusable home category icons and navigation hooks
2. Refine daily must quick entry headline
3. Add quick entry amount calculator
4. Redesign common entries and category picker
5. Add monthly comparison statistics
6. Upgrade monthly income expense trend chart
7. Refine recent transactions dashboard
8. Polish responsive home dashboard

不要把全部阶段压成一个超大 commit。

---

## 16. 最终验收标准

### 视觉

- PC 首页结构与目标图基本一致；
- 今日必记是快速记账第一视觉焦点；
- 最近常用为目标图单列；
- 一级分类有统一彩色图标；
- 金额栏有计算器；
- 三张统计卡有环比；
- 趋势图有坐标轴、网格和月份切换；
- 最近交易有分类图标和“今天/昨天”时间；
- 左右栏高度基本平衡。

### 功能

- 今日必记 CRUD/完成判断保留；
- 快速记账保存流程不变；
- 最近常用置顶/长按不退化；
- 一级/二级分类不退化；
- 切月份不影响今日数据；
- 查看更多能进入流水页。

### 工程

- TypeScript PASS
- ESLint PASS
- Unit tests PASS
- Integration tests PASS
- Migration tests PASS
- Server build PASS
- Vite build PASS
- git diff --check PASS

### 发布

- 分阶段 commit；
- push main；
- GitHub Actions 成功；
- sha-commit 与 latest 指向同一 GHCR Digest；
- VPS 更新后 /healthz 正常。

---

## 17. 本轮明确不包含

- 全局顶部搜索框；
- 通知中心；
- 用户头像下拉；
- Sidebar 全量换肤；
- 预算模块；
- 数据中心新页面；
- 自动记账任务；
- 定时提醒；
- PWA 离线同步；
- 大规模 CSS 文件拆分。

这些内容在首页主体改版完成后再单独立项。
