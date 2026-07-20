#!/usr/bin/env node
// 集成测试：启动 server.mjs，验证笔记正文读取（两条路径）
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const NODE = process.execPath;
// 显式传入正确凭证（对齐 mcp.json 的 env 注入，避免继承 shell 里的失效旧凭证）
const cid = fs.readFileSync(path.join(os.homedir(), ".config", "ima", "client_id"), "utf8").trim();
const ak = fs.readFileSync(path.join(os.homedir(), ".config", "ima", "api_key"), "utf8").trim();
const cleanEnv = { ...process.env, IMA_CLIENT_ID: cid, IMA_API_KEY: ak };
delete cleanEnv.IMA_OPENAPI_CLIENTID;
delete cleanEnv.IMA_OPENAPI_APIKEY;
const server = spawn(NODE, ["server.mjs"], { cwd: process.cwd(), env: cleanEnv });

let buf = "";
const pending = new Map();
let id = 0;

server.stdout.on("data", (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {}
  }
});
server.stderr.on("data", (d) => process.stderr.write("[server] " + d));

function rpc(method, params) {
  return new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
}

// 示例笔记：替换为你的笔记 media_id / note_id（从 search_knowledge 或 get_media_info 获取）
// 也可用环境变量注入：IMA_TEST_NOTE_MEDIA_ID / IMA_TEST_NOTE_ID
const NOTE_MEDIA_ID =
  process.env.IMA_TEST_NOTE_MEDIA_ID || "note_<你的账号标识>_<你的笔记ID>";
const NOTE_ID = process.env.IMA_TEST_NOTE_ID || "<你的笔记ID>";

(async () => {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0" },
  });

  // 工具枚举
  const tools = await rpc("tools/list", {});
  const names = (tools.result?.tools || []).map((t) => t.name);
  console.log("工具列表:", names.join(", "));
  console.log("含 get_note_content:", names.includes("get_note_content") ? "✅" : "❌");
  console.log("");

  // 路径1：get_media_info 自动附带笔记正文
  console.log("=== 路径1：get_media_info（笔记自动取正文）===");
  const r1 = await rpc("tools/call", {
    name: "get_media_info",
    arguments: { media_id: NOTE_MEDIA_ID },
  });
  const t1 = r1.result?.content?.[0]?.text || "";
  const j1 = JSON.parse(t1);
  console.log("note_content 长度:", (j1.note_content || "").length);
  console.log("正文前120字:", (j1.note_content || "").slice(0, 120).replace(/\n/g, " "));
  console.log("");

  // 路径2：get_note_content 直读
  console.log("=== 路径2：get_note_content（直读）===");
  const r2 = await rpc("tools/call", {
    name: "get_note_content",
    arguments: { note_id: NOTE_ID },
  });
  const t2 = r2.result?.content?.[0]?.text || "";
  const j2 = JSON.parse(t2);
  console.log("content 长度:", (j2.content || "").length);
  console.log("正文前120字:", (j2.content || "").slice(0, 120).replace(/\n/g, " "));

  server.kill();
  process.exit(0);
})();
