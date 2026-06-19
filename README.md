# 校园心愿墙系统

基于 Cloudflare Worker + D1 数据库的校园心愿墙系统，支持心愿、表白、日常、吐槽四种内容类型，配备完善的审核机制。

## ✨ 功能特性

### 用户端
- 🎯 **四种内容类型**：心愿、表白、日常、吐槽
- 🏷️ **分类系统**：每种类型下有多个分类标签
- ❤️ **点赞功能**：支持点赞，防重复点赞
- 🔍 **筛选搜索**：按类型、分类筛选，支持搜索
- 📱 **响应式设计**：完美适配移动端和桌面端

### 管理后台
- 📊 **数据仪表盘**：实时统计数据概览
- ✅ **内容审核**：单条审核、批量审核
- 📝 **内容管理**：查看、编辑、删除所有内容
- 🏷️ **分类管理**：增删改查分类
- 🚫 **敏感词管理**：关键词审核，支持批量导入
- 🤖 **AI 智能审核**：支持 OpenAI 格式和讯飞星火
- ⚙️ **系统设置**：灵活配置各项参数

### 审核机制
1. **第一层：关键词审核** - 后台可配置敏感词库，支持分级
2. **第二层：AI 智能审核** - 可开关、可切换提供方、可配置严格度

## 🛠️ 技术栈

- **后端**：Cloudflare Worker (Serverless)
- **数据库**：Cloudflare D1 (SQLite)
- **缓存**：Cloudflare KV
- **路由**：itty-router
- **前端**：原生 HTML/CSS/JS

## 🚀 快速开始

### 前置准备
1. Cloudflare 账号
2. Node.js 16+
3. Wrangler CLI

### 本地开发

1. **安装依赖**
```bash
npm install
```

2. **初始化本地数据库**
```bash
npm run init-db:local
```

3. **启动开发服务器**
```bash
npm run dev
```

4. **初始化管理员**
访问 `http://localhost:8787/api/admin/init` 初始化管理员账号
- 默认用户名：`admin`
- 默认密码：`admin123`

5. **访问管理后台**
打开 `http://localhost:8787/admin` 登录管理后台

### 部署到 Cloudflare

#### 方式一：命令行部署（推荐开发者使用）

1. **登录 Cloudflare**
```bash
npx wrangler login
```

2. **创建 D1 数据库**
```bash
npx wrangler d1 create wish-wall
```
将返回的 database_id 填入 `wrangler.toml`

3. **创建 KV 命名空间**
```bash
npx wrangler kv:namespace create KV
```
将返回的 id 填入 `wrangler.toml`

4. **初始化数据库**
```bash
npm run init-db
```

5. **部署**
```bash
npm run deploy
```

6. **初始化管理员**
部署后访问 `https://your-worker.workers.dev/api/admin/init`

---

#### 方式二：Cloudflare Dashboard 在线部署（零代码，推荐新手使用）

##### 📋 前置准备
- 一个 Cloudflare 账号（免费注册：https://dash.cloudflare.com/sign-up）
- 本项目代码（已 Fork 或下载到本地）

##### 🚀 详细部署步骤

###### 第一步：创建 D1 数据库
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 在左侧菜单中找到 **「Workers & Pages」** → **「D1 SQL Database」**
3. 点击 **「Create database」**
4. 数据库名称填写：`wish-wall`，点击 **「Create」**
5. 创建成功后，复制 **Database ID**，保存备用

###### 第二步：创建 KV 命名空间
1. 在左侧菜单中找到 **「Workers & Pages」** → **「KV」**
2. 点击 **「Create a namespace」**
3. 命名空间名称填写：`KV`，点击 **「Add」**
4. 创建成功后，复制命名空间的 **ID**，保存备用

###### 第三步：创建 Worker 项目
1. 在左侧菜单中找到 **「Workers & Pages」** → **「Create application」**
2. 选择 **「Create Worker」**
3. Worker 名称填写：`campus-wish-wall`（可自定义），点击 **「Deploy」**
4. 部署成功后，点击 **「Configure worker」** 进入配置页面

###### 第四步：配置数据库和 KV 绑定
1. 在 Worker 配置页面，点击 **「Settings」** 选项卡
2. 选择左侧 **「Variables」**
3. **绑定 D1 数据库：**
   - 滚动到 **「D1 Database Bindings」** 区域
   - 点击 **「Add binding」**
   - **Variable name** 填写：`DB`
   - **D1 database** 选择：刚才创建的 `wish-wall`
   - 点击 **「Save」**
4. **绑定 KV 命名空间：**
   - 滚动到 **「KV Namespace Bindings」** 区域
   - 点击 **「Add binding」**
   - **Variable name** 填写：`KV`
   - **KV namespace** 选择：刚才创建的 `KV`
   - 点击 **「Save」**
5. **设置环境变量：**
   - 滚动到 **「Environment Variables」** 区域
   - 添加以下变量：
     - `ADMIN_INIT_PASSWORD`：管理员初始密码（建议修改为复杂密码）
     - `JWT_SECRET`：JWT 密钥（建议使用随机字符串，越复杂越安全）
   - 点击 **「Save and deploy」**

###### 第五步：上传项目代码
**方式 A：通过 Wrangler CLI 上传（推荐）**
1. 修改项目根目录的 `wrangler.toml` 文件：
   - 将 `database_id` 替换为你的 D1 数据库 ID
   - 将 `id`（KV 部分）替换为你的 KV 命名空间 ID
   - 修改 `name` 为你的 Worker 名称
2. 在项目根目录执行：
```bash
npm install
npx wrangler deploy
```

**方式 B：通过 Dashboard 上传代码**
1. 在 Worker 配置页面，点击 **「Edit Code」**
2. 将本地项目的 `src/index.js` 内容复制粘贴到编辑器中
3. 点击 **「Save and deploy」**
4. 注意：此方式需要手动处理依赖，推荐使用方式 A

###### 第六步：初始化数据库表结构
1. 回到 D1 数据库页面，点击 `wish-wall` 数据库
2. 点击 **「Console」** 选项卡
3. 打开项目中的 `src/schema.sql` 文件，复制所有 SQL 语句
4. 将 SQL 语句粘贴到 Console 输入框中，点击 **「Run」**
5. 看到 "Query executed successfully." 表示数据库初始化成功

###### 第七步：初始化管理员账号
1. 访问你的 Worker 地址：`https://your-worker-name.workers.dev/api/admin/init`
2. 看到 "Admin initialized successfully" 表示初始化成功
3. 默认用户名：`admin`
4. 默认密码：你在环境变量中设置的 `ADMIN_INIT_PASSWORD`（默认 `admin123`）

###### 第八步：登录管理后台
1. 访问：`https://your-worker-name.workers.dev/admin`
2. 使用管理员账号登录
3. 建议首次登录后立即修改默认密码

---

#### 方式三：GitHub Actions 自动部署（CI/CD）

如果你将代码托管在 GitHub，可以配置 GitHub Actions 实现自动部署：

1. 在 Cloudflare Dashboard 中创建 API Token：
   - 进入 **「My Profile」** → **「API Tokens」**
   - 点击 **「Create Token」**
   - 选择 **「Edit Cloudflare Workers」** 模板
   - 权限配置：Account - Workers R2 Storage - Edit
   - 点击 **「Continue to summary」** → **「Create Token」**
   - 复制生成的 Token 保存

2. 在 GitHub 仓库的 **Settings** → **Secrets and variables** → **Actions** 中添加以下 Secrets：
   - `CLOUDFLARE_API_TOKEN`：你的 Cloudflare API Token
   - `CLOUDFLARE_ACCOUNT_ID`：你的 Cloudflare Account ID（在 Dashboard 右下角可找到）

3. 在项目根目录创建 `.github/workflows/deploy.yml`：
```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm install
      
      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

4. 推送到 main 分支后会自动部署

---

#### ⚠️ 部署常见问题

**Q: 部署后访问显示 500 错误怎么办？**
A: 检查以下几点：
1. D1 数据库和 KV 是否正确绑定
2. 环境变量是否设置正确
3. 数据库表是否已初始化（执行 schema.sql）
4. 查看 Worker 的 **Logs** 选项卡查看具体错误信息

**Q: 如何绑定自定义域名？**
A: 在 Worker 配置页面 → **「Triggers」** → **「Custom Domains」** → **「Add Custom Domain」**，输入你的域名即可（域名需要已在 Cloudflare 托管）

**Q: 免费版有什么限制？**
A: Cloudflare Worker 免费版每天 10 万次请求，D1 免费版 5GB 存储、每月 500 万次读取，对于中小规模校园完全够用。

**Q: 如何更新代码？**
A: 修改代码后重新执行 `npx wrangler deploy` 即可，数据库数据不会丢失。

## 📁 项目结构

```
campus-wish-wall/
├── src/
│   ├── index.js              # 主入口
│   ├── schema.sql            # 数据库初始化脚本
│   ├── api/
│   │   ├── public.js         # 公开 API
│   │   └── admin.js          # 管理后台 API
│   ├── db/
│   │   └── database.js       # 数据库操作
│   ├── middleware/
│   │   └── auth.js           # 中间件
│   ├── utils/
│   │   ├── helpers.js        # 工具函数
│   │   └── ai-review.js      # AI 审核模块
│   └── pages/
│       ├── index.html        # 用户端页面
│       ├── index.html.js     # 用户端 HTML 导出
│       ├── admin.html        # 管理后台页面
│       └── admin.html.js     # 管理后台 HTML 导出
├── package.json
├── wrangler.toml
├── build-pages.js            # HTML 构建脚本
└── README.md
```

## 🔧 配置说明

### wrangler.toml 配置项

| 配置项 | 说明 |
|--------|------|
| `DB` | D1 数据库绑定 |
| `KV` | KV 命名空间绑定 |
| `ADMIN_INIT_PASSWORD` | 管理员初始密码 |
| `JWT_SECRET` | JWT 密钥（生产环境请修改） |

### AI 审核配置

在管理后台的「AI 审核配置」页面可以配置：
- 是否启用 AI 审核
- AI 提供方（OpenAI 格式 / 讯飞星火）
- 审核严格度
- 是否自动驳回违规内容
- 审核维度（政治、色情、暴力、广告、辱骂）
- API Key 和模型配置

## 📝 API 接口

### 公开接口
- `GET /api/posts` - 获取内容列表
- `GET /api/posts/:id` - 获取内容详情
- `POST /api/posts` - 发布内容
- `POST /api/posts/:id/like` - 点赞
- `GET /api/categories` - 获取分类列表
- `GET /api/stats` - 获取统计数据

### 管理后台接口
- `POST /api/admin/login` - 登录
- `GET /api/admin/init` - 初始化管理员
- `GET /api/admin/posts` - 获取内容列表
- `PUT /api/admin/posts/:id/review` - 审核内容
- `POST /api/admin/posts/batch-review` - 批量审核
- `DELETE /api/admin/posts/:id` - 删除内容
- `GET /api/admin/categories` - 分类列表
- `POST /api/admin/categories` - 新增分类
- `PUT /api/admin/categories/:id` - 编辑分类
- `DELETE /api/admin/categories/:id` - 删除分类
- `GET /api/admin/sensitive-words` - 敏感词列表
- `POST /api/admin/sensitive-words` - 新增敏感词
- `POST /api/admin/sensitive-words/batch` - 批量导入
- `PUT /api/admin/sensitive-words/:id` - 编辑敏感词
- `DELETE /api/admin/sensitive-words/:id` - 删除敏感词
- `GET /api/admin/ai-config` - 获取 AI 配置
- `PUT /api/admin/ai-config` - 更新 AI 配置
- `POST /api/admin/ai-config/test` - 测试 AI 配置
- `GET /api/admin/settings` - 获取系统设置
- `PUT /api/admin/settings` - 更新系统设置
- `GET /api/admin/stats` - 获取统计数据

## 🔒 安全特性

- ✅ JWT 身份认证
- ✅ 密码哈希存储
- ✅ XSS 防护（内容转义）
- ✅ SQL 注入防护（参数化查询）
- ✅ IP 脱敏存储
- ✅ 发布频率限制
- ✅ CORS 跨域处理

## 📊 数据库表

- `posts` - 内容表
- `categories` - 分类表
- `sensitive_words` - 敏感词表
- `admins` - 管理员表
- `settings` - 系统设置表
- `likes` - 点赞记录表

## 🎨 内容类型

| 类型 | 标识 | 说明 |
|------|------|------|
| 心愿 | `wish` | 许愿、祝福、愿望 |
| 表白 | `confession` | 暗恋告白、感谢、心里话 |
| 日常 | `daily` | 生活分享、趣事、随感 |
| 吐槽 | `rant` | 抱怨、发泄、树洞 |

## 📝 开发说明

### 修改前端页面
编辑 `src/pages/index.html` 或 `src/pages/admin.html`，然后运行构建脚本：

```bash
node build-pages.js
```

或者直接修改对应的 `.html.js` 文件。

### 数据库迁移
修改 `src/schema.sql` 后重新执行：
```bash
npx wrangler d1 execute wish-wall --local --file=src/schema.sql
```

## 📄 License

MIT
