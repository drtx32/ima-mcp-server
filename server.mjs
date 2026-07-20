#!/usr/bin/env node
/**
 * ima-mcp-server — IMA 知识库 MCP 服务器
 *
 * 将 ima.qq.com 官方 OpenAPI 封装为标准 MCP 工具，可在任何支持 MCP 的
 * agent 软件（Claude Desktop、Cursor、Cline、Continue、VS Code Copilot 等）中使用。
 *
 * 凭证来源（优先级从高到低）：
 *   1. 环境变量 IMA_CLIENT_ID / IMA_API_KEY
 *   2. 环境变量 IMA_OPENAPI_CLIENTID / IMA_OPENAPI_APIKEY（兼容 ima-skill）
 *   3. 配置文件 ~/.config/ima/client_id 与 ~/.config/ima/api_key
 *
 * 传输方式：stdio（最通用）
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import os from "os";
import path from "path";

// ──────────────────────────────────────────────────────────────
// 配置
// ──────────────────────────────────────────────────────────────
const BASE_URL = "https://ima.qq.com";
const API_PREFIX = "openapi/wiki/v1"; // 知识库模块
const NOTE_PREFIX = "openapi/note/v1"; // 笔记模块
const SERVER_NAME = "ima-mcp-server";
const SERVER_VERSION = "1.1.0";

// ──────────────────────────────────────────────────────────────
// 凭证加载
// ──────────────────────────────────────────────────────────────
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function loadCredentials() {
  const clientId =
    process.env.IMA_CLIENT_ID ||
    process.env.IMA_OPENAPI_CLIENTID ||
    readFileSafe(path.join(os.homedir(), ".config", "ima", "client_id"));
  const apiKey =
    process.env.IMA_API_KEY ||
    process.env.IMA_OPENAPI_APIKEY ||
    readFileSafe(path.join(os.homedir(), ".config", "ima", "api_key"));

  if (!clientId || !apiKey) {
    throw new Error(
      "未找到 IMA 凭证。请通过以下任一方式配置：\n" +
        "  1. 环境变量 IMA_CLIENT_ID 和 IMA_API_KEY\n" +
        "  2. 环境变量 IMA_OPENAPI_CLIENTID 和 IMA_OPENAPI_APIKEY\n" +
        "  3. 配置文件 ~/.config/ima/client_id 和 ~/.config/ima/api_key\n" +
        "凭证获取地址：https://ima.qq.com/agent-interface"
    );
  }
  return { clientId, apiKey };
}

// ──────────────────────────────────────────────────────────────
// IMA OpenAPI 调用
// ──────────────────────────────────────────────────────────────
async function imaPost(apiPath, body, prefix = API_PREFIX) {
  const { clientId, apiKey } = loadCredentials();
  const url = `${BASE_URL}/${prefix}/${apiPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "ima-openapi-clientid": clientId,
      "ima-openapi-apikey": apiKey,
      "ima-openapi-ctx": `mcp_server=${SERVER_VERSION}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`IMA API 返回非 JSON 响应（${res.status}）：${text.slice(0, 200)}`);
  }
  // 统一响应结构 { code, msg, data }
  if (parsed.code !== 0) {
    throw new Error(`IMA API 错误 [${parsed.code}]：${parsed.msg || "未知错误"}`);
  }
  return parsed.data ?? parsed;
}

// ──────────────────────────────────────────────────────────────
// 工具定义
// ──────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "search_knowledge_base",
    description:
      "搜索知识库列表。query 传空字符串时返回当前账号下所有可见知识库（含自建与订阅）。" +
      "知道知识库名称但不知道 ID 时用此接口。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "知识库名称关键词。传空字符串返回全部知识库。",
          default: "",
        },
        cursor: {
          type: "string",
          description: "分页游标，首次传空字符串。",
          default: "",
        },
        limit: {
          type: "integer",
          description: "返回数量上限，1-20。",
          minimum: 1,
          maximum: 20,
          default: 20,
        },
      },
      required: [],
    },
  },
  {
    name: "get_knowledge_base",
    description:
      "获取知识库详情（描述、推荐问题等）。支持一次查询 1-20 个知识库。",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "知识库 ID 列表，1-20 个，不可重复。",
          minItems: 1,
          maxItems: 20,
        },
      },
      required: ["ids"],
    },
  },
  {
    name: "get_knowledge_list",
    description:
      "浏览知识库内容列表（根目录或指定文件夹），分页返回文件与子文件夹。" +
      "操作根目录时省略 folder_id。folder_id 以 folder_ 前缀开头。",
    inputSchema: {
      type: "object",
      properties: {
        knowledge_base_id: {
          type: "string",
          description: "知识库 ID。",
        },
        cursor: {
          type: "string",
          description: "分页游标，首次传空字符串。",
          default: "",
        },
        limit: {
          type: "integer",
          description: "返回数量上限，1-50。",
          minimum: 1,
          maximum: 50,
          default: 20,
        },
        folder_id: {
          type: "string",
          description: "文件夹 ID（folder_ 前缀）。省略则浏览根目录。",
        },
      },
      required: ["knowledge_base_id"],
    },
  },
  {
    name: "search_knowledge",
    description:
      "在指定知识库中按关键词搜索内容（含文件和文件夹），返回命中的标题、摘要片段。" +
      "这是知识库内容检索的核心接口。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词。",
        },
        knowledge_base_id: {
          type: "string",
          description: "目标知识库 ID。",
        },
        cursor: {
          type: "string",
          description: "分页游标，首次传空字符串。",
          default: "",
        },
      },
      required: ["query", "knowledge_base_id"],
    },
  },
  {
    name: "get_media_info",
    description:
      "获取知识库条目的原文内容或下载链接。传入 media_id（来自 get_knowledge_list 或 search_knowledge 的返回）。" +
      "对微信文章/网页/文件类，返回可访问 URL；对笔记类（media_id 以 note_ 开头），" +
      "会自动拉取并返回笔记正文（note_content 字段，纯文本）。",
    inputSchema: {
      type: "object",
      properties: {
        media_id: {
          type: "string",
          description: "媒体条目 ID。",
        },
      },
      required: ["media_id"],
    },
  },
  {
    name: "get_note_content",
    description:
      "读取笔记正文（纯文本）。传入 note_id（笔记的数字 ID，即 get_media_info 返回的 notebook_id，" +
      "或笔记搜索接口返回的 doc_id）。这是读取 IMA 笔记原文的专用接口。",
    inputSchema: {
      type: "object",
      properties: {
        note_id: {
          type: "string",
          description: "笔记数字 ID。",
        },
        target_content_format: {
          type: "integer",
          description: "内容格式：0=纯文本（推荐）。",
          default: 0,
        },
      },
      required: ["note_id"],
    },
  },
  {
    name: "get_addable_knowledge_base_list",
    description:
      "获取当前用户有权限添加内容的知识库列表。仅在未指定目标知识库时使用。",
    inputSchema: {
      type: "object",
      properties: {
        cursor: {
          type: "string",
          description: "分页游标，首次传空字符串。",
          default: "",
        },
        limit: {
          type: "integer",
          description: "返回数量上限，1-50。",
          minimum: 1,
          maximum: 50,
          default: 20,
        },
      },
      required: [],
    },
  },
  {
    name: "import_urls",
    description:
      "将网页或微信文章 URL 添加到知识库（1-10 个 URL）。添加到根目录时省略 folder_id。",
    inputSchema: {
      type: "object",
      properties: {
        knowledge_base_id: {
          type: "string",
          description: "目标知识库 ID。",
        },
        urls: {
          type: "array",
          items: { type: "string" },
          description: "URL 列表，1-10 个。",
          minItems: 1,
          maxItems: 10,
        },
        folder_id: {
          type: "string",
          description: "目标文件夹 ID（folder_ 前缀）。省略则添加到根目录。",
        },
      },
      required: ["knowledge_base_id", "urls"],
    },
  },
];

// ──────────────────────────────────────────────────────────────
// 工具调度
// ──────────────────────────────────────────────────────────────
async function dispatchTool(name, args) {
  args = args || {};
  switch (name) {
    case "search_knowledge_base":
      return imaPost("search_knowledge_base", {
        query: args.query ?? "",
        cursor: args.cursor ?? "",
        limit: args.limit ?? 20,
      });

    case "get_knowledge_base":
      if (!Array.isArray(args.ids) || args.ids.length === 0) {
        throw new Error("ids 参数必须为非空数组");
      }
      return imaPost("get_knowledge_base", { ids: args.ids });

    case "get_knowledge_list": {
      const body = {
        knowledge_base_id: args.knowledge_base_id,
        cursor: args.cursor ?? "",
        limit: args.limit ?? 20,
      };
      if (args.folder_id) body.folder_id = args.folder_id;
      return imaPost("get_knowledge_list", body);
    }

    case "search_knowledge":
      return imaPost("search_knowledge", {
        query: args.query,
        knowledge_base_id: args.knowledge_base_id,
        cursor: args.cursor ?? "",
      });

    case "get_media_info": {
      const info = await imaPost("get_media_info", { media_id: args.media_id });
      // 笔记类：自动拉取正文（OpenAPI 的 get_media_info 只回内部 chrome://note 链接）
      const noteId = info?.notebook_ext_info?.notebook_id;
      if (noteId) {
        try {
          const doc = await imaPost(
            "get_doc_content",
            { note_id: String(noteId), target_content_format: 0 },
            NOTE_PREFIX
          );
          info.note_content = doc?.content ?? "";
        } catch (e) {
          info.note_content_error = `笔记正文读取失败：${e.message || e}`;
        }
      }
      return info;
    }

    case "get_note_content":
      return imaPost(
        "get_doc_content",
        {
          note_id: String(args.note_id),
          target_content_format: args.target_content_format ?? 0,
        },
        NOTE_PREFIX
      );

    case "get_addable_knowledge_base_list":
      return imaPost("get_addable_knowledge_base_list", {
        cursor: args.cursor ?? "",
        limit: args.limit ?? 20,
      });

    case "import_urls": {
      const body = {
        knowledge_base_id: args.knowledge_base_id,
        urls: args.urls,
      };
      if (args.folder_id) body.folder_id = args.folder_id;
      return imaPost("import_urls", body);
    }

    default:
      throw new Error(`未知工具：${name}`);
  }
}

// ──────────────────────────────────────────────────────────────
// MCP Server
// ──────────────────────────────────────────────────────────────
const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

// 列出工具
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// 调用工具
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const data = await dispatchTool(name, args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `❌ ${err.message || err}`,
        },
      ],
    };
  }
});

// ──────────────────────────────────────────────────────────────
// 启动
// ──────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 日志输出到 stderr，不干扰 stdio 通信
  console.error(`[${SERVER_NAME} v${SERVER_VERSION}] 已启动，等待 MCP 客户端连接…`);
}

main().catch((err) => {
  console.error(`启动失败：${err.message || err}`);
  process.exit(1);
});
