// A stand-in for the Claude API, for trying the app locally without an API
// key or any cost. It answers POST /v1/messages with a streamed, made-up
// summary in the shape the real API uses.
//
//   pnpm mock-claude            # listens on http://127.0.0.1:4010
//   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=mock pnpm dev
import http from "node:http";

const port = Number(process.env.MOCK_CLAUDE_PORT ?? 4010);

function send(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function fakeSummary(prompt: string, model: string) {
  const title = /Title: (.*)/.exec(prompt)?.[1] ?? "this article";
  const chinese = /[一-鿿]/.test(prompt.split("<article_text>")[1] ?? "");
  const label = model.replace("claude-", "");
  return chinese
    ? {
        language: "zh-Hans",
        tldr: `（模拟摘要，${label}）《${title}》的要点概述。`,
        key_points: ["这是本地模拟服务生成的第一条要点。", "真实摘要需要 Claude API 密钥。", "第三条要点。"],
        suggested_tags: ["测试"],
      }
    : {
        language: "en",
        tldr: `(Mock summary from ${label}) The main point of “${title}”.`,
        key_points: [
          "This summary comes from the local mock, not from Claude.",
          "Set a real ANTHROPIC_API_KEY to get real summaries.",
          "Everything else, from saving to storing the result, runs for real.",
        ],
        suggested_tags: ["testing"],
      };
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "Not found" } }));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const prompt = String(body.messages?.[0]?.content ?? "");
  const text = JSON.stringify(fakeSummary(prompt, body.model));
  const inputTokens = Math.ceil(prompt.length / 4);
  console.log(`mock-claude: ${body.model}, ~${inputTokens} input tokens`);

  await new Promise((resolve) => setTimeout(resolve, 800)); // feel like a real call
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  send(res, "message_start", {
    type: "message_start",
    message: {
      id: `msg_mock_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: body.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  });
  send(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  for (let i = 0; i < text.length; i += 40) {
    send(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + 40) } });
  }
  send(res, "content_block_stop", { type: "content_block_stop", index: 0 });
  send(res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: Math.ceil(text.length / 4) },
  });
  send(res, "message_stop", { type: "message_stop" });
  res.end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock Claude API on http://127.0.0.1:${port} (set ANTHROPIC_BASE_URL to this)`);
});
