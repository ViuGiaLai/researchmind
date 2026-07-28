import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";


afterEach(() => {
  vi.unstubAllGlobals();
});


describe("chat retry requests", () => {
  it("sends retry=true for a regenerated non-streaming answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "new answer",
          citations: [],
          model_used: "test",
          papers_used: [],
          chunks_used: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.chat("question", ["paper"], "current", "session", undefined, "fast", [], true);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ retry: true, use_cache: false });
  });

  it("sends retry=true for a regenerated streaming answer", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"done":true,"modified_content":"new"}\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body });
    vi.stubGlobal("fetch", fetchMock);

    const completed = new Promise<void>((resolve, reject) => {
      const stream = api.chatStream(
        "question",
        ["paper"],
        "current",
        "session",
        undefined,
        "fast",
        false,
        [],
        true,
      );
      stream.onDone = () => resolve();
      stream.onError = reject;
    });

    await completed;
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ retry: true, use_cache: false });
  });
});
