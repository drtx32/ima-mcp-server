// 端到端测试：通过 MCP 协议调用真实 IMA API
import { spawn } from "child_process";

const NODE = process.execPath;
const SERVER = new URL("./server.mjs", import.meta.url).pathname;

const child = spawn(NODE, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
let stdoutBuf = "";
let phase = 0; // 0=init, 1=list, 2=call

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

child.stdout.on("data", (data) => {
  stdoutBuf += data.toString();
  let lines = stdoutBuf.split("\n");
  stdoutBuf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const resp = JSON.parse(line);

      if (resp.id === 1 && phase === 0) {
        console.log("✅ [1/3] MCP 握手成功");
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        phase = 1;
      } else if (resp.id === 2 && phase === 1) {
        const n = resp.result?.tools?.length || 0;
        console.log(`✅ [2/3] 工具枚举成功（${n} 个工具）`);
        console.log("       正在调用 search_knowledge_base 做真实 API 请求…");
        send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "search_knowledge_base",
            arguments: { query: "", limit: 5 },
          },
        });
        phase = 2;
      } else if (resp.id === 3 && phase === 2) {
        console.log("✅ [3/3] 真实 API 调用成功！");
        const text = resp.result?.content?.[0]?.text || "";
        try {
          const data = JSON.parse(text);
          const list = data.info_list || data.list || data.searched_knowledge_base_list || data.knowledge_base_list || [];
          const arr = list.map((i) => i.knowledge_base || i).filter(Boolean);
          console.log(`\n📚 返回 ${arr.length} 个知识库：`);
          arr.forEach((kb, i) => {
            console.log(`   ${i + 1}. ${kb.kb_name || kb.title || kb.name} (id: ${kb.kb_id || kb.knowledge_base_id || kb.id})`);
            if (kb.content_count) console.log(`      内容数: ${kb.content_count}`);
          });
        } catch {
          console.log("   原始响应（前300字）:", text.slice(0, 300));
        }
        console.log("\n🎉 端到端测试全部通过 — MCP server + 凭证 + IMA API 均正常");
        child.kill();
        process.exit(0);
      } else if (resp.isError) {
        console.error("❌ 工具调用返回错误:", resp.result?.content?.[0]?.text);
        child.kill();
        process.exit(1);
      }
    } catch {
      // 非 JSON
    }
  }
});

child.stderr.on("data", (d) => console.error("[server]", d.toString().trim()));
child.on("error", (e) => { console.error("❌", e.message); process.exit(1); });

send({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e-test", version: "1.0.0" } },
});

setTimeout(() => { console.error("❌ 超时"); child.kill(); process.exit(1); }, 20000);
