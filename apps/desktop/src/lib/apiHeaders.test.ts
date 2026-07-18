import { describe, expect, it } from "vitest";
import { createApiHeaders } from "./api";

describe("createApiHeaders", () => {
  it("adds language and desktop proxy headers without inventing credentials", () => {
    expect(createApiHeaders("", "vi")).toEqual({
      "X-Language": "vi",
      "Accept-Language": "vi",
      "ngrok-skip-browser-warning": "true",
    });
  });

  it("adds the Firebase bearer token and preserves request-specific headers", () => {
    expect(createApiHeaders("signed-token", "en", { "Content-Type": "application/json" })).toEqual({
      "X-Language": "en",
      "Accept-Language": "en",
      "ngrok-skip-browser-warning": "true",
      Authorization: "Bearer signed-token",
      "Content-Type": "application/json",
    });
  });
});
