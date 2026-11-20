import { test } from "node:test";
import assert from "node:assert/strict";
import { meterSse } from "../lib/meter.ts";

const enc = new TextEncoder();
const sse = (chunks) =>
  new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });

const START = 'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-opus-5-5","usage":{"input_tokens":120,"cache_read_input_tokens":20000,"output_tokens":1}}}\n\n';
const DELTA = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n';
const END = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":640}}\n\n';

test("passes bytes through unchanged and reports final usage once", async () => {
  const calls = [];
  // Split an event across chunks to prove line buffering works.
  const out = meterSse(sse([START.slice(0, 50), START.slice(50), DELTA, END]), async (u, m) => calls.push({ u, m }));
  const text = await new Response(out).text();
  assert.equal(text, START + DELTA + END);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].u, { input_tokens: 120, cache_read_input_tokens: 20000, output_tokens: 640 });
  assert.equal(calls[0].m, "claude-opus-5-5");
});

test("client disconnect still charges what was produced", async () => {
  const calls = [];
  const out = meterSse(sse([START, DELTA, END]), async (u) => calls.push(u));
  const reader = out.getReader();
  await reader.read(); // first chunk only
  await reader.cancel();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input_tokens, 120);
});

test("ignores junk lines and pings", async () => {
  const calls = [];
  const out = meterSse(sse(["event: ping\ndata: {}\n\n", "data: not json\n\n", START, END]), async (u) => calls.push(u));
  await new Response(out).text();
  assert.equal(calls[0].output_tokens, 640);
});
