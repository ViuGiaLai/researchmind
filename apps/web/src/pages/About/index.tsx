import { Link } from "react-router-dom";

export default function AboutPage() {
  return (
    <div className="landing-root">
      {/* ═══ HERO ═══ */}
      <section className="hero" id="about-hero">
        <div className="hero-bg-overlay" />
        <div className="container">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Local-first · Open Source · Made in Vietnam
          </div>
          <h1 className="hero-title">
            Một chiếc thẻ mục lục,
            <br />
            <span className="gradient-text">cho hàng trăm bài báo bạn chưa kịp đọc</span>
          </h1>
          <p className="hero-desc">
            ResearchMind là trợ lý nghiên cứu AI chạy ngay trên máy tính của bạn — đọc, tổng hợp và trích dẫn
            tài liệu học thuật bằng tiếng Việt, không cần đưa dữ liệu lên máy chủ nào.
          </p>
        </div>
      </section>

      {/* ═══ PROBLEM STATEMENT ═══ */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="section-label">Vấn đề</span>
            <h2 className="section-title">
              Nghiên cứu không nên bắt đầu bằng việc đọc 200 file PDF một mình
            </h2>
          </div>

          <div style={{ maxWidth: 720, margin: "0 auto 40px", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7, marginBottom: 16 }}>
              Ai từng làm nghiên cứu ở Việt Nam cũng quen với cảnh này: một thư mục đầy PDF tải về, mỗi bài
              vài chục trang, và không đủ thời gian để đọc hết trước khi viết tổng quan tài liệu.
            </p>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7, marginBottom: 16 }}>
              Các công cụ AI nghiên cứu quốc tế có thể giúp, nhưng thường đi kèm vài rào cản: giá theo tháng
              tính bằng đô, giao diện và mô hình chủ yếu tối ưu cho tiếng Anh, và quan trọng nhất — dữ liệu
              nghiên cứu của bạn phải rời khỏi máy để lên một server ở đâu đó bạn không kiểm soát được.
            </p>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7 }}>
              Với nhiều đề tài, đặc biệt là nghiên cứu chưa công bố hoặc có yếu tố nhạy cảm, điều đó là một
              rào cản thật, không phải chuyện nhỏ.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">⏱</div>
              <h3>Thời gian</h3>
              <p>
                Đọc và tổng hợp hàng trăm trang tài liệu là công việc tốn nhiều giờ nhất trong nghiên cứu,
                nhưng lại ít được hỗ trợ nhất.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">🌐</div>
              <h3>Ngôn ngữ</h3>
              <p>
                Phần lớn công cụ AI nghiên cứu không được thiết kế cho người dùng tiếng Việt.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">🔒</div>
              <h3>Dữ liệu</h3>
              <p>
                Không phải ai cũng muốn — hoặc được phép — đưa tài liệu nghiên cứu lên cloud của bên thứ ba.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PHILOSOPHY ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Triết lý</span>
            <h2 className="section-title">Dữ liệu của bạn ở lại máy của bạn</h2>
          </div>

          <div style={{ maxWidth: 720, margin: "0 auto", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7, marginBottom: 16 }}>
              ResearchMind được xây trên một nguyên tắc đơn giản: công cụ nghiên cứu nên hoạt động độc lập,
              không bắt bạn phải đánh đổi quyền riêng tư để lấy tiện lợi.
            </p>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7, marginBottom: 16 }}>
              Toàn bộ tài liệu, chỉ mục tìm kiếm và cơ sở dữ liệu của bạn được lưu trực tiếp trên máy, bằng
              SQLite và ChromaDB. Không có bước upload bắt buộc. Không có tài khoản bắt buộc để bắt đầu dùng.
            </p>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7, marginBottom: 16 }}>
              Bạn cũng là người chọn AI nào sẽ đọc tài liệu của mình — có thể chạy hoàn toàn offline với mô
              hình local qua Ollama, hoặc kết nối với OpenAI, Gemini, Claude tuỳ nhu cầu. ResearchMind không
              khoá bạn vào một nhà cung cấp AI duy nhất.
            </p>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7 }}>
              Đồng bộ và chia sẻ lên cloud là lựa chọn thêm vào sau, không phải điều kiện để sử dụng.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Cách hoạt động</span>
            <h2 className="section-title">Bốn bước, từ chồng PDF đến bản thảo có trích dẫn</h2>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Nhập tài liệu</h3>
              <p>
                Kéo thả PDF vào ResearchMind, hoặc nhập trực tiếp từ Semantic Scholar, OpenAlex, Crossref.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>AI đọc và tổng hợp</h3>
              <p>
                Hệ thống trích xuất luận điểm chính, phát hiện điểm đồng thuận và mâu thuẫn giữa các nguồn,
                dựng sơ đồ quan hệ giữa bài báo — tác giả — chủ đề.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Hỏi đáp bằng tiếng Việt</h3>
              <p>
                Đặt câu hỏi trực tiếp trên toàn bộ thư viện tài liệu của bạn, nhận câu trả lời kèm trích dẫn
                rõ nguồn.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">4</div>
              <h3>Xuất bản thảo</h3>
              <p>
                Xuất báo cáo, trích dẫn theo chuẩn học thuật (BibTeX, CSL), sang PDF, Word hoặc LaTeX.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CREATOR ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Người đứng sau</span>
            <h2 className="section-title">Một người, một nhu cầu thật</h2>
          </div>

          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-lg)",
                padding: "28px 32px",
                marginBottom: 24,
              }}
            >
              <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 16 }}>
                Mình là <strong style={{ color: "var(--text-primary)" }}>Rmah Viu</strong>, sinh viên ngành Kỹ
                thuật phần mềm tại Đại học Đông Á, Đà Nẵng, dự kiến tốt nghiệp năm 2027. Trước ResearchMind,
                mình từng làm Web Developer & SEO trong môi trường thực tế, và cũng là người thường xuyên phải
                tự đọc — tự tổng hợp tài liệu cho những dự án riêng.
              </p>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 16 }}>
                ResearchMind bắt đầu từ chính nhu cầu đó: một công cụ đủ nhanh để không làm chậm quá trình
                nghiên cứu, đủ riêng tư để không phải lo dữ liệu đi đâu, và đủ hiểu tiếng Việt để không phải
                dịch qua dịch lại trong đầu.
              </p>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>
                Dự án vẫn đang trong quá trình phát triển tích cực, và mình xây nó với cùng một tiêu chuẩn mà
                mình muốn tự mình sử dụng hàng ngày.
              </p>
            </div>

            {/* Author Card */}
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "20px 24px",
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px 16px" }}>
                <span style={{ color: "var(--text-muted)" }}>Author</span>
                <span style={{ color: "var(--text-primary)" }}>Rmah Viu</span>

                <span style={{ color: "var(--text-muted)" }}>Role</span>
                <span style={{ color: "var(--text-primary)" }}>Người phát triển & thiết kế</span>

                <span style={{ color: "var(--text-muted)" }}>Since</span>
                <span style={{ color: "var(--text-primary)" }}>2024</span>

                <span style={{ color: "var(--text-muted)" }}>GitHub</span>
                <a
                  href="https://github.com/ViuGiaLai"
                  target="_blank"
                  rel="noopener"
                  style={{ color: "var(--accent-blue)", textDecoration: "none" }}
                  className="hover:opacity-80"
                >
                  github.com/ViuGiaLai
                </a>

                <span style={{ color: "var(--text-muted)" }}>LinkedIn</span>
                <a
                  href="https://linkedin.com/in/viu005"
                  target="_blank"
                  rel="noopener"
                  style={{ color: "var(--accent-blue)", textDecoration: "none" }}
                  className="hover:opacity-80"
                >
                  linkedin.com/in/viu005
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TECH STACK ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Công nghệ</span>
            <h2 className="section-title">Được xây bằng</h2>
          </div>

          <div className="trust-bar" style={{ padding: 0 }}>
            <div className="trust-logos">
              {["Tauri", "FastAPI", "ChromaDB", "SQLite", "React", "TypeScript"].map((tech) => (
                <span key={tech} className="trust-logo" style={{ fontSize: "1.1rem" }}>
                  {tech}
                </span>
              ))}
            </div>
          </div>

          <p
            style={{
              textAlign: "center",
              maxWidth: 600,
              margin: "32px auto 0",
              color: "var(--text-secondary)",
              fontSize: "0.9rem",
            }}
          >
            Kiến trúc local-first: mọi tính năng cốt lõi — đọc tài liệu, tìm kiếm, hỏi đáp — hoạt động đầy đủ
            ngay cả khi không có kết nối internet.
          </p>
        </div>
      </section>

      {/* ═══ CURRENT STATUS ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Trạng thái hiện tại</span>
            <h2 className="section-title">Đang được xây từng ngày</h2>
          </div>

          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div
              style={{
                background: "rgba(45, 212, 191, 0.05)",
                border: "1px solid rgba(45, 212, 191, 0.15)",
                borderLeft: "4px solid var(--accent-teal)",
                borderRadius: "var(--radius-md)",
                padding: "20px 24px",
              }}
            >
              <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 12 }}>
                ResearchMind hiện đang trong giai đoạn phát triển tích cực. Những gì đang được hoàn thiện gần
                nhất: mở rộng nguồn dữ liệu học thuật, hệ thống phát hiện đồng thuận — mâu thuẫn giữa các
                nghiên cứu, và trợ lý viết bản thảo có trích dẫn tự động.
              </p>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-secondary)", margin: 0 }}>
                Đây là một dự án đang lớn lên cùng người dùng đầu tiên của nó. Góp ý, báo lỗi hay đề xuất tính
                năng đều được đón nhận.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <div className="cta-section">
        <div className="container">
          <div className="cta-card">
            <h2>Sẵn sàng thử ResearchMind?</h2>
            <p>
              Tải ứng dụng desktop miễn phí hoặc xem mã nguồn trên GitHub. Không cần tài khoản để bắt đầu.
            </p>
            <div className="cta-actions">
              <Link to="/#download" className="btn btn-primary">
                Tải ResearchMind Desktop
              </Link>
              <a
                href="https://github.com/ViuGiaLai/researchmind"
                className="btn btn-secondary"
                target="_blank"
                rel="noopener"
              >
                Xem mã nguồn trên GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
