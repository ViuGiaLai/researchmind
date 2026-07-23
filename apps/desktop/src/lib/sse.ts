export interface SseConsumeResult {
  eventCount: number;
  malformedCount: number;
}

/**
 * Consume JSON Server-Sent Events from a fetch response body.
 *
 * Handles frames split across network chunks, CRLF, comments, multiline data,
 * and a valid final frame that is not terminated by a newline.
 */
export async function consumeJsonSse<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
): Promise<SseConsumeResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const dataLines: string[] = [];
  let buffer = "";
  let eventCount = 0;
  let malformedCount = 0;

  const dispatch = () => {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    dataLines.length = 0;
    let event: T;
    try {
      event = JSON.parse(payload) as T;
    } catch {
      malformedCount += 1;
      return;
    }
    onEvent(event);
    eventCount += 1;
  };

  const consumeLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    if (line === "data" || line.startsWith("data:")) {
      const value = line.length === 4 ? "" : line.slice(5).replace(/^ /, "");
      dataLines.push(value);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(consumeLine);
    }

    buffer += decoder.decode();
    if (buffer) consumeLine(buffer);
    dispatch();
    return { eventCount, malformedCount };
  } finally {
    reader.releaseLock();
  }
}
