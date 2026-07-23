import { describe, expect, it } from "vitest";

import { consumeJsonSse } from "./sse";

function streamChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

describe("consumeJsonSse", () => {
  it("parses frames split across arbitrary network chunks", async () => {
    const events: Array<{ chunk?: string; done?: boolean }> = [];
    const result = await consumeJsonSse<{ chunk?: string; done?: boolean }>(
      streamChunks([
        'data: {"chu',
        'nk":"xin chào"}\r\n\r\n',
        'data: {"done":true}\n\n',
      ]),
      (event) => events.push(event),
    );

    expect(events).toEqual([{ chunk: "xin chào" }, { done: true }]);
    expect(result).toEqual({ eventCount: 2, malformedCount: 0 });
  });

  it("dispatches the final frame when the connection closes without a newline", async () => {
    const events: Array<{ done: boolean }> = [];
    const result = await consumeJsonSse<{ done: boolean }>(
      streamChunks(['data: {"done":true}']),
      (event) => events.push(event),
    );

    expect(events).toEqual([{ done: true }]);
    expect(result.eventCount).toBe(1);
  });

  it("skips malformed frames and continues with later events", async () => {
    const events: Array<{ value: number }> = [];
    const result = await consumeJsonSse<{ value: number }>(
      streamChunks([
        "data: not-json\n\n",
        ': keepalive\n\ndata: {"value":2}\n\n',
      ]),
      (event) => events.push(event),
    );

    expect(events).toEqual([{ value: 2 }]);
    expect(result).toEqual({ eventCount: 1, malformedCount: 1 });
  });
});
