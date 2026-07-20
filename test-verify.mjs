#!/usr/bin/env node
// 凭证验证脚本：读取 ~/.config/ima/ 配置，调用 IMA OpenAPI 验证新凭证
import fs from "fs";
import os from "os";
import path from "path";

const BASE = "https://ima.qq.com/openapi/wiki/v1";

function readSafe(p) {
  try { return fs.readFileSync(p, "utf8").trim(); } catch { return ""; }
}

const clientId = readSafe(path.join(os.homedir(), ".config", "ima", "client_id"));
const apiKey = readSafe(path.join(os.homedir(), ".config", "ima", "api_key"));

if (!clientId || !apiKey) {
  console.error("❌ 未读取到凭证文件");
  process.exit(1);
}

console.error("client_id 长度:", clientId.length, "| api_key 长度:", apiKey.length);

async function call(apiPath, body) {
  const res = await fetch(`${BASE}/${apiPath}`, {
    method: "POST",
    headers: {
      "ima-openapi-clientid": clientId,
      "ima-openapi-apikey": apiKey,
      "ima-openapi-ctx": "mcp_server=1.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { code: -1, msg: "非JSON", raw: text.slice(0, 200) }; }
  return parsed;
}

(async () => {
  console.error("→ 调用 search_knowledge_base（列出知识库）…");
  const r = await call("search_knowledge_base", { query: "", cursor: "", limit: 5 });
  console.error("返回 code:", r.code, "| msg:", r.msg || "");
  if (r.code === 0) {
    const kbList = r.data?.list || [];
    console.error("✅ 凭证有效！命中知识库数量:", kbList.length);
    const out = (r.data?.list || []).map((k) => ({
      name: k.name || k.title,
      kb_id: k.knowledge_base_id,
      item_count: k.item_num ?? k.knowledge_num,
      type: k.type,
    }));
    console.log(JSON.stringify(out, null, 2));
    // 进一步用关键词验证检索能力
    console.error("→ 用关键词 '业主' 检索知识库…");
    const r2 = await call("search_knowledge_base", { query: "业主", cursor: "", limit: 10 });
    console.error("返回 code:", r2.code, "| msg:", r2.msg || "");
    const list2 = r2.data?.list || [];
    console.error("命中知识库数量:", list2.length);
    if (list2.length > 0) {
      console.log(JSON.stringify(list2.map((k) => ({
        name: k.name || k.title,
        kb_id: k.knowledge_base_id,
        item_count: k.item_num ?? k.knowledge_num,
      })), null, 2));
    }
  } else {
    console.error("❌ 凭证仍未通过:", JSON.stringify(r).slice(0, 400));
    process.exit(2);
  }
})();
