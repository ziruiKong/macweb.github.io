# 哥大 GSAS × IEOR × Business 选课助手

一个零依赖的哥大选课网站，专注 GSAS、IEOR 与商学院课程：课程浏览、历史学期资料、课程推荐、学业规划与先修课建模、课表日历、校园地图。

## 快速开始

需要 Node.js 18+（本机已装 Node 24）。

```powershell
cd columbia-planner
node serve.mjs          # 默认 http://localhost:8000
```

浏览器打开 `http://localhost:8000` 即可。也可以直接用浏览器打开 `index.html`（核心浏览功能可用；历史学期实时拉取和地图底图需要联网，建议走本地服务）。

## 数据从哪来

- 哥大 Registrar 官方 Open Data Service（XML/JSON）：`https://academic.cuit.columbia.edu/opendataservice/doc/json`
- 本项目的默认数据源是社区镜像 `soid/columbia-catalog-data`，它每天从哥大 Directory of Classes 爬取，并富化了 Wikipedia、CULPA 评分等字段，且 `raw.githubusercontent.com` 支持 CORS，前端可按学期直接拉取。
- 想从源头爬取，可参考官方爬虫仓库：`github.com/soid/columbia-catalog-scraper`

## 功能

- 课程浏览：全英文界面，三列卡片；搜索 + 按范围（GSAS / IEOR / Business）、院系、年级、校区、授课方式、上课日筛选。默认 2027 Spring（3121 个班次），可一键切到 2026 Fall（3833 个班次）。
- 学期对比：同一门课在详情里并排对比 2026 Fall / 2027 Spring 的班次数、选课人数、学分、老师与首次上课时间。
- 历史学期：2015–2027 全部学期档案，按学期实时加载并浏览，可下载 JSON / CSV / 选课人数数据；支持自己输入学期（如 2028-Fall）添加并加载。
- 选课分析：每日选课/退课记录、当前选课人数、开学 → 第 1 周 → 第 2 周 → 最新的流失率分析（会自动排除已结课/分段课程）。
- 课程推荐：规则引擎，根据院系、年级、兴趣关键词、已修课程与先修课满足情况打分，附推荐理由；另有热门课程榜。
- 学业规划与建模：示例专业模板的毕业要求进度、8 学期计划搭建、先修课依赖图可视化。
- 课表日历：日/周/月/议程视图、事件创建编辑、拖拽改期、每日/周/月视图、节假日、事件搜索、时间冲突检测、导出 `.ics`。
- Google Calendar：通过 Google Identity Services 的 OAuth 令牌连接主日历，读取 Google 事件，并把本站新建或修改的事件同步到 Google Calendar。
- 校园模型：基于 OpenStreetMap 道路/草坪和 NYC 建筑轮廓生成的正交轴测线稿；包含主校区完整建筑、两座校门、Low Library、Butler、St. Paul's、Alma Mater 等细化地标，并支持鼠标轨道旋转、Shift 拖拽平移和滚轮缩放。

## 爬虫 / 刷新数据

```powershell
node crawler.mjs list                       # 列出可用学期
node crawler.mjs fetch 2027-Spring          # 拉取完整学期
node crawler.mjs fetch 2027-Spring --depts COMS,ECON --out data/my.json
node crawler.mjs bundle                     # 重新生成 GSAS/IEOR/Business 目录
node crawler.mjs bundle --all               # 生成全部院系的完整目录
node crawler.mjs bundle --depts COMS,QMSS   # 只保留指定院系
node crawler.mjs bundle --out data/courses-2026-Fall.json --from-local ../../work/2026-Fall.json --enroll-local ../../work/2026-Fall-enroll.json
node crawler.mjs semesters                  # 重新生成学期索引 data/semesters.{json,js}
```

爬虫脚本是单次 GET、带 User-Agent 的礼貌抓取，不会对哥大官网造成压力。

## 每小时课程 / 选课记录同步

```powershell
node sync-data.mjs
```

`serve.mjs` 启动后会立即同步一次，之后每 60 分钟重新执行
`sync-data.mjs`。同步会：

- 从社区镜像刷新课程目录和历史选课数据；
- 读取 Columbia Directory of Classes 的 66 个院系页面；
- 用官网当日人数覆盖本地最新值，并写入当天历史；
- 通过 `/api/data-status` 暴露数据日期、同步时间和错误状态；
- 保留上一份有效数据，单次抓取失败不会清空页面。

也可以手动执行 `node sync-data.mjs`。输出包括：

- `data/enrollment-history/2027-Spring.json`：完整历史（base + 每日变化）
- `data/enrollment-history/2027-Spring.js`：网站加载的轻量摘要
- `data/enrollment-history/2027-Spring-summary.csv`：每日汇总

默认同步间隔可以通过环境变量覆盖，例如：

```powershell
$env:DATA_SYNC_INTERVAL_MINUTES=60
node serve.mjs 8000
```

官网页面提供当日人数；社区镜像继续用于课程目录和历史序列。若某一门课没有公开数字人数，系统会保留上一份有效值，不会补零。

## 课程评价

- 课程详情通过本站 `/api/culpa-course` 服务端代理读取 CULPA 的公开课程页和最新学生评价，并缓存 6 小时。
- CULPA 内容是独立、匿名的学生评论，页面中会明确标注它不是哥伦比亚官方课程评价。
- RateMyProfessors 当前的 `robots.txt` 禁止普通爬虫访问，因此本站只提供带教授姓名预填的站外查询入口，不抓取或复制其评价正文。
- 哥大 CourseWorks 的官方课程评价需要 Columbia 登录，公开静态站点不会绕过权限获取。

## Google Calendar 连接

Google 不允许 `file://` 页面直接发起 OAuth，所以请通过本地服务打开：

```powershell
node serve.mjs 8000
```

然后在 Google Cloud Console 中：

1. 启用 **Google Calendar API**。
2. 配置 OAuth 同意屏幕。
3. 创建 **OAuth 2.0 Web application** Client ID。
4. 在 Authorized JavaScript origins 中加入 `http://localhost:8000`。
5. 打开日历页，点击 **Connect Google**，粘贴 Client ID 并完成 Google 授权。

所需权限范围为 `https://www.googleapis.com/auth/calendar.events`。访问令牌只保存在当前页面内存中，不会写入
localStorage；Client ID 属于公开标识，可保存在本地浏览器中。

## 说明与免责声明

- 课程数据来源于公开的哥大课程目录及其社区镜像，仅供个人选课参考。
- “专业模板”“毕业要求”为示例模型，**不是官方毕业要求**，请以各院系官方规定为准。
- 地图建筑坐标为近似值，仅用于示意。
- 校园模型的建筑轮廓来自 NYC building footprints，道路和绿地来自 OpenStreetMap；它是线稿化教学模型，不替代工程测绘或校园官方地图。
- 尊重数据源与哥大的使用条款，请勿用于商业用途或高频批量抓取。
