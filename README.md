# ima-mcp-server

将 [IMA 知识库](https://ima.qq.com) 官方 OpenAPI 封装为标准 **MCP（Model Context Protocol）** 服务器，可在任何支持 MCP 的 agent 软件中检索、浏览、读取知识库内容。

## 特性

- ✅ 标准 MCP 协议（stdio 传输），兼容所有 MCP 客户端
- ✅ 8 个知识库工具：搜索、浏览、读取原文、读取笔记正文、添加网页
- ✅ 凭证灵活配置（环境变量 / 配置文件）
- ✅ 零外部服务依赖，纯 Node.js 运行

## 可用工具

| 工具 | 功能 |
|---|---|
| `search_knowledge_base` | 搜索知识库列表（空 query 返回全部，含订阅库） |
| `get_knowledge_base` | 获取知识库详情（描述、推荐问题） |
| `get_knowledge_list` | 浏览知识库内容（根目录/文件夹，分页） |
| `search_knowledge` | 在知识库内按关键词搜索文档 |
| `get_media_info` | 获取条目原文/下载链接；**笔记类自动返回正文**（`note_content`） |
| `get_note_content` | 读取笔记正文（纯文本），传入 note_id |
| `get_addable_knowledge_base_list` | 获取可添加内容的知识库列表 |
| `import_urls` | 将网页/微信文章添加到知识库 |

> **笔记读取说明**：IMA 笔记正文通过 `openapi/note/v1/get_doc_content` 读取。`get_media_info` 命中笔记（`media_id` 以 `note_` 开头）时会自动附带 `note_content` 字段；也可用 `get_note_content` 传 note_id 直读。微信文章/网页/文件类则返回可访问 URL。

## 前置要求

- **Node.js ≥ 18**（内置 fetch）
- **IMA OpenAPI 凭证**：在 https://ima.qq.com/agent-interface 获取 Client ID 和 API Key

## 安装

```bash
git clone <repo> ima-mcp-server
cd ima-mcp-server
npm install
```

或直接将 `server.mjs` + `package.json` 拷贝到本地后 `npm install`。

## 凭证配置（三选一）

### 方式 A：环境变量（推荐，配置在 MCP 客户端中）

```
IMA_CLIENT_ID=你的_client_id
IMA_API_KEY=你的_api_key
```

### 方式 B：兼容 ima-skill 的环境变量名

```
IMA_OPENAPI_CLIENTID=你的_client_id
IMA_OPENAPI_APIKEY=你的_api_key
```

### 方式 C：配置文件

```bash
mkdir -p ~/.config/ima
echo "你的_client_id" > ~/.config/ima/client_id
echo "你的_api_key" > ~/.config/ima/api_key
```

优先级：方式 A > 方式 B > 方式 C

## 各 MCP 客户端配置

以下配置中的路径请替换为你的实际路径。

### Claude Desktop

配置文件位置：
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ima": {
      "command": "node",
      "args": ["C:\\Users\\你的用户名\\ima-mcp-server\\server.mjs"],
      "env": {
        "IMA_CLIENT_ID": "你的_client_id",
        "IMA_API_KEY": "你的_api_key"
      }
    }
  }
}
```

### Cursor

配置文件：`~/.cursor/mcp.json`（全局）或项目内 `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "ima": {
      "command": "node",
      "args": ["/Users/你的用户名/ima-mcp-server/server.mjs"],
      "env": {
        "IMA_CLIENT_ID": "你的_client_id",
        "IMA_API_KEY": "你的_api_key"
      }
    }
  }
}
```

### Cline (VS Code)

在 Cline 设置 → MCP Servers → 添加：

```json
{
  "ima": {
    "command": "node",
    "args": ["/path/to/ima-mcp-server/server.mjs"],
    "env": {
      "IMA_CLIENT_ID": "你的_client_id",
      "IMA_API_KEY": "你的_api_key"
    },
    "disabled": false,
    "autoApprove": []
  }
}
```

### VS Code Copilot / Continue

```json
{
  "mcpServers": {
    "ima": {
      "command": "node",
      "args": ["/path/to/ima-mcp-server/server.mjs"],
      "env": {
        "IMA_CLIENT_ID": "你的_client_id",
        "IMA_API_KEY": "你的_api_key"
      }
    }
  }
}
```

### WorkBuddy

编辑 `~/.workbuddy/mcp.json`，在 `mcpServers` 中添加上述 `ima` 条目，然后在连接器管理页面点击「Trust」启用。

## 验证

配置完成后，在 agent 软件中尝试：

> "列出我的所有知识库"

如果返回知识库列表，说明配置成功。

也可手动测试协议：

```bash
node test-protocol.mjs
```

## 故障排查

| 问题 | 解决方案 |
|---|---|
| `未找到 IMA 凭证` | 检查环境变量或配置文件是否正确设置 |
| `IMA API 错误 [xxx]` | 查看 msg 内容；常见为凭证无效或权限不足 |
| Claude Desktop 未显示工具 | 重启 Claude Desktop；检查 `claude_desktop_config.json` 路径与 JSON 格式 |
| Windows 路径需双反斜杠 | JSON 中 `\\` 表示一个 `\`，如 `C:\\Users\\name\\...` |
| Node 版本不足 | 升级到 18+，`node -v` 确认 |

## 与 ima-skill 的关系

| 维度 | ima-mcp-server（本项目） | ima-skill（WorkBuddy 内置） |
|---|---|---|
| 协议 | 标准 MCP，跨 agent 通用 | WorkBuddy skill 格式 |
| 适用范围 | Claude Desktop、Cursor、Cline 等 | 仅 WorkBuddy 生态 |
| 认证 | OpenAPI clientId/apiKey | 同（或 WorkBuddy OAuth 连接器） |
| 功能范围 | 8 个知识库工具（读取 + 笔记正文 + 添加网页） | 完整（含文件上传、笔记管理） |
| 传输 | stdio | 脚本调用 |

如需在 WorkBuddy 内使用完整功能（含文件上传），继续使用 ima-skill；如需在其它 agent 软件中使用，用本项目。

## 安全说明

- 凭证仅作为 HTTP 头发送至 `ima.qq.com`，不发送至任何其它域名
- 凭证不会被记录到日志或文件
- `import_urls` 的 URL 由 IMA 服务端抓取，本地不发送文件内容

## License

MIT
