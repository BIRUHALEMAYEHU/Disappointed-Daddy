import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ChatAccumulator, streamChat, toChatMessages, toChatTools, TOOLS, PROVIDERS, looksLikeApiKey } from "../dist/index.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("tools translate to Chat Completions functions", () => {
  const tools = toChatTools(TOOLS);
  assert.equal(tools.length, TOOLS.length);
  assert.equal(tools[0].type, "function");
  assert.equal(tools[0].function.name, "read_file");
  assert.equal(tools[0].function.parameters.type, "object");
});

test("history translates: text, tool calls, tool results; thinking dropped", () => {
  const msgs = toChatMessages([{ text: "SYS A" }, { text: "SYS B" }], [
    { role: "user", content: "Start." },
    { role: "assistant", content: [
      { type: "thinking", thinking: "secret", signature: "x" },
      { type: "text", text: "Let me look." },
      { type: "tool_use", id: "t1", name: "read_file", input: { path: "src/a.js" } },
    ] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "const a = 1;" }] },
    { role: "user", content: "Because it's simple." },
  ]);
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[0].content, "SYS A\n\nSYS B");
  assert.deepEqual(msgs[2], {
    role: "assistant", content: "Let me look.",
    tool_calls: [{ id: "t1", type: "function", function: { name: "read_file", arguments: '{"path":"src/a.js"}' } }],
  });
  assert.deepEqual(msgs[3], { role: "tool", tool_call_id: "t1", content: "const a = 1;" });
  assert.deepEqual(msgs[4], { role: "user", content: "Because it's simple." });
  assert.ok(!JSON.stringify(msgs).includes("secret"));
});

test("streamed tool-call fragments are reassembled into tool_use blocks", () => {
  const acc = new ChatAccumulator();
  acc.add({ model: "gpt-x", choices: [{ delta: { content: "Hmm. " } }] });
  acc.add({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "read_file", arguments: '{"pa' } }] } }] });
  acc.add({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"x.js"}' } }] }, finish_reason: "tool_calls" }] });
  const m = acc.toMessage();
  assert.equal(m.stop_reason, "tool_use");
  assert.equal(m.content[0].text, "Hmm. ");
  assert.deepEqual(m.content[1], { type: "tool_use", id: "c1", name: "read_file", input: { path: "x.js" } });
});

test("plain answer ends the turn; length cut-off maps to max_tokens", () => {
  const a = new ChatAccumulator();
  a.add({ choices: [{ delta: { content: "Why JWT?" }, finish_reason: "stop" }] });
  assert.equal(a.toMessage().stop_reason, "end_turn");
  const b = new ChatAccumulator();
  b.add({ choices: [{ delta: { content: "..." }, finish_reason: "length" }] });
  assert.equal(b.toMessage().stop_reason, "max_tokens");
});

test("streamChat parses SSE from a compatible server and surfaces errors", async () => {
  const sse = [
    'data: {"model":"gemini-3.8-flash","choices":[{"delta":{"content":"Son, "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"we need to talk."},"finish_reason":"stop"}]}\n\n',
    "data: [DONE]\n\n",
  ].join("");
  let sent;
  globalThis.fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body), auth: init.headers.authorization }; return new Response(sse); };
  const deltas = [];
  const s = streamChat({ baseUrl: PROVIDERS.gemini.baseUrl, apiKey: "k".repeat(20), model: "gemini-3.8-flash", messages: [], tools: [] });
  s.on("text", (d) => deltas.push(d));
  const m = await s.finalMessage();
  assert.equal(sent.url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(sent.auth, `Bearer ${"k".repeat(20)}`);
  assert.equal(sent.body.stream, true);
  assert.deepEqual(deltas, ["Son, ", "we need to talk."]);
  assert.equal(m.content[0].text, "Son, we need to talk.");

  globalThis.fetch = async () => Response.json({ error: { message: "API key not valid" } }, { status: 400 });
  await assert.rejects(streamChat({ baseUrl: "https://x", apiKey: "k", model: "m", messages: [], tools: [] }).finalMessage(), /API key not valid/);
});

test("full interview turn over an OpenAI-compatible provider: tool call, tool result, reply", async () => {
  const { InterviewSession } = await import("../dist/index.js");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dad-oai-"));
  fs.writeFileSync(path.join(root, "server.js"), "app.use(auth); // SECRET_MARKER_NOT_ENV");
  const memory = { p: { project: "x", updated: "", topics: {}, mocks: [] }, async load() { return this.p; }, async save() { return false; } };

  const requests = [];
  const replies = [
    // 1st call: the model asks to read a file.
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_file","arguments":"{\\"path\\":\\"server.js\\"}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
    // 2nd call: it asks its question.
    'data: {"choices":[{"delta":{"content":"Why is auth mounted globally?"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
  ];
  globalThis.fetch = async (url, init) => { requests.push(JSON.parse(init.body)); return new Response(replies[requests.length - 1]); };

  const session = await InterviewSession.create({ root, progressStore: memory, mode: "talk", voice: "dad", provider: "openai-compatible", providerId: "gemini", apiKey: "k".repeat(30) });
  let text = "";
  const tools = [];
  await session.start({ onText: (d) => { text += d; }, onToolUse: (k, d) => tools.push(`${k}:${d}`) });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].model, "gemini-3.8-flash");
  assert.deepEqual(tools, ["read:server.js"]);
  const toolMsg = requests[1].messages.find((m) => m.role === "tool");
  assert.equal(toolMsg.tool_call_id, "c1");
  assert.match(toolMsg.content, /app\.use\(auth\)/);
  assert.equal(text, "Why is auth mounted globally?");
  fs.rmSync(root, { recursive: true, force: true });
});

test("openai-compatible needs a known provider, a key and a model", async () => {
  const { InterviewSession } = await import("../dist/index.js");
  const base = { root: ".", mode: "talk", voice: "dad", provider: "openai-compatible" };
  await assert.rejects(InterviewSession.create({ ...base, providerId: "nope", apiKey: "k".repeat(30) }), /supported AI provider/);
  await assert.rejects(InterviewSession.create({ ...base, providerId: "gemini" }), /API key/);
  await assert.rejects(InterviewSession.create({ ...base, providerId: "openai", apiKey: "k".repeat(30) }), /model/);
});

test("busy model falls back to the next one; non-retryable errors don't", async () => {
  const tried = [];
  globalThis.fetch = async (url, init) => {
    const model = JSON.parse(init.body).model;
    tried.push(model);
    if (model === "busy-model") return Response.json({ error: { message: "high demand" } }, { status: 503 });
    return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  };
  const m = await streamChat({ baseUrl: "https://x", apiKey: "k", model: "busy-model", fallbackModels: ["backup-model"], messages: [], tools: [] }).finalMessage();
  assert.deepEqual(tried, ["busy-model", "backup-model"]);
  assert.equal(m.content[0].text, "ok");

  tried.length = 0;
  globalThis.fetch = async (url, init) => { tried.push(JSON.parse(init.body).model); return Response.json({ error: { message: "bad key" } }, { status: 401 }); };
  await assert.rejects(streamChat({ baseUrl: "https://x", apiKey: "k", model: "a", fallbackModels: ["b"], messages: [], tools: [] }).finalMessage(), /bad key/);
  assert.deepEqual(tried, ["a"], "a rejected key must not be retried on other models");

  globalThis.fetch = async () => Response.json({ error: { message: "high demand" } }, { status: 503 });
  await assert.rejects(streamChat({ baseUrl: "https://x", apiKey: "k", model: "a", fallbackModels: ["b"], messages: [], tools: [] }).finalMessage(), /high demand/);
});

test("key sanity check", () => {
  assert.equal(looksLikeApiKey("sk-proj-" + "a".repeat(30)), true);
  assert.equal(looksLikeApiKey("AIza" + "b".repeat(35)), true);
  assert.equal(looksLikeApiKey("short"), false);
  assert.equal(looksLikeApiKey("has space " + "a".repeat(20)), false);
});
