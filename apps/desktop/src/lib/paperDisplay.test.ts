import { describe, expect, it } from "vitest";
import {
  paperDisplayAuthors,
  paperDisplayTitle,
  repairVietnameseDisplayText,
} from "./paperDisplay";

describe("paperDisplayTitle", () => {
  it("strips uuid storage names and prefers human titles", () => {
    expect(
      paperDisplayTitle(
        "bfd3b29a-1234-5678-9abc-dbbff62d9f47",
        "bfd3b29a-1234-5678-9abc-dbbff62d9f47_Deep_Learning_Survey.pdf",
      ),
    ).toBe("Deep Learning Survey");
  });

  it("rejects logo OCR junk", () => {
    expect(
      paperDisplayTitle("Logo chữ K Tối giản Hiện đại Vàng đen", "real_paper.pdf"),
    ).toBe("real paper");
  });
});

describe("paperDisplayAuthors", () => {
  it("drops device placeholders", () => {
    expect(paperDisplayAuthors('["Unknown: Acer", "Nguyen Van A"]')).toEqual([
      "Nguyen Van A",
    ]);
  });
});

describe("repairVietnameseDisplayText", () => {
  it("merges common OCR syllable splits", () => {
    const fixed = repairVietnameseDisplayText("thiế t bị ngườ i xuấ t");
    expect(fixed).not.toContain("thiế t");
    expect(fixed).not.toContain("ngườ i");
    expect(fixed).not.toContain("xuấ t");
    expect(fixed).toContain("thiết");
    expect(fixed).toContain("người");
    expect(fixed).toContain("xuất");
  });
});
