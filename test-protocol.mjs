// 测试脚本：验证 ima-mcp-server 的 MCP 协议通信
import { spawn } from "child_process";

const NODE = "C:/Users/17116/.workbuddy/binaries/node/versions/22.22.2/node.exe";
const SERVER = "C:/Users/17116/ima-mcp-server/server.mjs";

const child = spawn(NODE, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });

let stdoutBuf = "";
let step = 0;

const requests = [
  // 1. initialize
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-client", version: "1.0.0" } } },
  // 2. initialized notification
  { jsonrpc: "2.0", method: "notifications/initialized" },
  // 3. tools/list
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
];

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

child.stdout.on("data", (data) => {
  stdoutBuf += data.toString();
  let lines = stdoutBuf.split("\n");
  stdoutBuf = lines.pop(); // 保留最后不完整的行
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const resp = JSON.parse(line);
      if (resp.id === 1) {
        console.log("✅ initialize 响应：");
        console.log("   serverInfo:", JSON.stringify(resp.result?.serverInfo));
        console.log("   protocolVersion:", resp.result?.protocolVersion);
        // 发送 initialized 通知 + tools/list
        send(requests[1]);
        send(requests[2]);
      } else if (resp.id === 2) {
        console.log("✅ tools/list 响应：");
        const tools = resp.result?.tools || [];
        console.log(`   共 ${tools.length} 个工具：`);
        tools.forEach((t, i) => {
          console.log(`   ${i + 1}. ${t.name}`);
          console.log(`      ${t.description?.slice(0, 60)}...`);
        });
        console.log("\n✅ 全部测试通过，MCP server 工作正常");
        child.kill();
        process.exit(0);
      }
    } catch (e) {
      // 非 JSON 行，跳过
    }
  }
});

child.stderr.on("data", (data) => {
  console.error("[server stderr]", data.toString().trim());
});

child.on("error", (err) => {
  console.error("❌ 启动失败：", err.message);
  process.exit(1);
});

// 发送 initialize
send(requests[0]);

// 超时保护
setTimeout(() => {
  console.error("❌ 测试超时（10s）");
  child.kill();
  process.exit(1);
}, 10000);
