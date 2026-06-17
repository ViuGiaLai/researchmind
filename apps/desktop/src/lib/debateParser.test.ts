import { describe, it, expect } from "vitest";
import { parseDebate } from "./debateParser";

const sampleDebateResponse = `AI A (Ủng hộ):
• Luận điểm chính: Transformer vượt trội vì khả năng song song và mô hình hóa phụ thuộc dài hạn hiệu quả hơn RNN. [Vaswani et al. 2017, trang 5] Transformer xử lý toàn bộ chuỗi cùng lúc thay vì tuần tự, cho phép training nhanh hơn và khả năng học pattern dài hạn tốt hơn.
• Phản biện ngắn: RNN có chi phí tính toán cao khi xử lý chuỗi dài và dễ gặp vấn đề vanishing gradient. Transformer không có vấn đề này nhờ cơ chế attention.

AI B (Phản biện):
• Luận điểm chính: RNN vẫn hiệu quả với dữ liệu chuỗi ngắn và tiêu tốn ít bộ nhớ, có lợi cho tác vụ nhúng trên thiết bị. [Hochreiter & Schmidhuber 1997] RNN có dung lượng mô hình nhỏ hơn, phù hợp với các ứng dụng edge computing. Transformer có lượng tham số lớn, yêu cầu bộ nhớ cao.
• Phản biện ngắn: Transformer có thể được tinh chỉnh hoặc nén để giảm chi phí trong nhiều trường hợp, nhưng yêu cầu thêm công việc tối ưu hóa.

Kết luận:
• Transformer thường tốt hơn cho phụ thuộc dài hạn và chuỗi lớn, RNN vẫn có chỗ dùng cho tài nguyên hạn chế và chuỗi ngắn. Lựa chọn phụ thuộc vào yêu cầu cụ thể của ứng dụng.

3 Đề xuất:
1. Thử nghiệm trực tiếp: chạy benchmark trên cùng bộ dữ liệu A với các cấu hình Transformer/RNN và báo metric latency/accuracy. [Devlin et al. 2018]
2. Ablation: so sánh phiên bản Transformer đã nén/quantize với RNN để kiểm tra trade-off chi phí-hiệu suất.
3. Kiểm tra robustness: đánh giá trên dữ liệu nhiễu và chuỗi dài để đo ảnh hưởng của overfitting và memory bandwidth.`;

describe("debateParser", () => {
  it("parses AI A main argument and rebuttal", () => {
    const result = parseDebate(sampleDebateResponse);
    expect(result.aiA?.main).toContain("Transformer vượt trội");
    expect(result.aiA?.rebuttal).toContain("vanishing gradient");
  });

  it("parses AI B main argument and rebuttal", () => {
    const result = parseDebate(sampleDebateResponse);
    expect(result.aiB?.main).toContain("RNN vẫn hiệu quả");
    expect(result.aiB?.rebuttal).toContain("tinh chỉnh");
  });

  it("extracts citations", () => {
    const result = parseDebate(sampleDebateResponse);
    expect(result.aiA?.citations?.length).toBeGreaterThanOrEqual(1);
    expect(result.aiA?.citations?.[0].source).toBe("Vaswani et al. 2017");
  });

  it("parses conclusion", () => {
    const result = parseDebate(sampleDebateResponse);
    expect(result.conclusion).toContain("Transformer thường tốt hơn");
  });

  it("parses suggestions", () => {
    const result = parseDebate(sampleDebateResponse);
    expect(result.suggestions?.length).toBe(3);
  });
});
