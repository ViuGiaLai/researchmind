import React, { useEffect, useState } from "react";
import { api, PersonalBrainResponse } from "../../lib/api";
import { IconBrain, IconSpinner, IconBook, IconStar, IconLibrary, IconChat, IconActivity, IconBulb, IconTags, IconPenLine, IconCalendar, IconClock, IconWithText } from "../Icons";

export const PersonalBrainView: React.FC = () => {
  const [data, setData] = useState<PersonalBrainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBrainData();
  }, []);

  const loadBrainData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPersonalBrain();
      setData(result);
    } catch (e) {
      console.error("Failed to load personal brain data:", e);
      setError("Không thể tải dữ liệu. Đảm bảo backend đang chạy.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="personal-brain-view">
        <div className="personal-brain-loading">
          <IconSpinner size={32} />
          <span>Đang phân tích thư viện nghiên cứu của bạn...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="personal-brain-view">
        <div className="personal-brain-error">
          <p>{error}</p>
          <button className="personal-brain-retry" onClick={loadBrainData}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { reading_stats, topic_interests, author_preferences, timeline, recent_activity, insights } = data;

  return (
    <div className="personal-brain-view">
      {/* Hero */}
      <div className="personal-brain-hero">
        <IconBrain size={40} className="icon-gradient" />
        <h1 className="personal-brain-hero-title">Bộ não kiến thức cá nhân</h1>
        <p className="personal-brain-hero-desc">
          Phân tích xu hướng nghiên cứu và sở thích đọc của bạn
        </p>
      </div>

      {/* Reading Stats Overview */}
      <div className="personal-brain-stats-grid">
        <div className="personal-brain-stat-card">
          <div className="personal-brain-stat-icon">
            <IconLibrary size={22} />
          </div>
          <div className="personal-brain-stat-value">{reading_stats.total_papers}</div>
          <div className="personal-brain-stat-label">Tổng papers</div>
        </div>
        <div className="personal-brain-stat-card">
          <div className="personal-brain-stat-icon" style={{ color: "var(--color-success, #22c55e)" }}>
            <IconBook size={22} />
          </div>
          <div className="personal-brain-stat-value">{reading_stats.read_count}</div>
          <div className="personal-brain-stat-label">Đã đọc</div>
        </div>
        <div className="personal-brain-stat-card">
          <div className="personal-brain-stat-icon" style={{ color: "var(--color-warning, #eab308)" }}>
            <IconBook size={22} />
          </div>
          <div className="personal-brain-stat-value">{reading_stats.unread_count}</div>
          <div className="personal-brain-stat-label">Chưa đọc</div>
        </div>
        <div className="personal-brain-stat-card">
          <div className="personal-brain-stat-icon" style={{ color: "var(--color-primary)" }}>
            <IconStar size={22} />
          </div>
          <div className="personal-brain-stat-value">{reading_stats.starred_count}</div>
          <div className="personal-brain-stat-label">Yêu thích</div>
        </div>
      </div>

      {/* Reading Progress Bar */}
      <div className="personal-brain-section">
        <h3 className="personal-brain-section-title">
          <IconWithText icon={IconActivity} size={16}>Tiến độ đọc</IconWithText>
        </h3>
        <div className="personal-brain-progress-container">
          <div className="personal-brain-progress-bar">
            <div
              className="personal-brain-progress-fill"
              style={{ width: `${reading_stats.read_percentage}%` }}
            />
          </div>
          <div className="personal-brain-progress-info">
            <span>{reading_stats.read_percentage}% đã đọc ({reading_stats.read_count}/{reading_stats.total_papers})</span>
            <span>{reading_stats.total_pages} trang tổng cộng</span>
          </div>
        </div>
        {reading_stats.languages && Object.keys(reading_stats.languages).length > 0 && (
          <div className="personal-brain-languages">
            {Object.entries(reading_stats.languages).map(([lang, count]) => (
              <span key={lang} className="personal-brain-lang-chip">
                {lang.toUpperCase()}: {count}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <div className="personal-brain-section">
          <h3 className="personal-brain-section-title">
            <IconWithText icon={IconBulb} size={16}>Gợi ý từ AI</IconWithText>
          </h3>
          <div className="personal-brain-insights-list">
            {insights.map((insight, i) => (
              <div key={i} className={`personal-brain-insight-card insight-${insight.type}`}>
                <div className="personal-brain-insight-title">{insight.title}</div>
                <div className="personal-brain-insight-desc">{insight.description}</div>
                {insight.action && (
                  <div className="personal-brain-insight-action">{insight.action} →</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topic Interests */}
      <div className="personal-brain-section">
        <h3 className="personal-brain-section-title">
          <IconWithText icon={IconTags} size={16}>Chủ đề quan tâm</IconWithText>
        </h3>
        <div className="personal-brain-interests-grid">
          {/* Tags */}
          {topic_interests.top_tags.length > 0 && (
            <div className="personal-brain-interest-group">
              <h4 className="personal-brain-interest-label">Thẻ (Tags)</h4>
              <div className="personal-brain-tag-list">
                {topic_interests.top_tags.map((tag) => (
                  <span key={tag.topic} className="personal-brain-tag" style={{ fontSize: `${Math.min(0.7 + tag.count * 0.05, 1.1)}rem` }}>
                    {tag.topic} <span className="personal-brain-tag-count">{tag.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Keywords from titles */}
          {topic_interests.top_keywords.length > 0 && (
            <div className="personal-brain-interest-group">
              <h4 className="personal-brain-interest-label">Từ khóa trong tiêu đề</h4>
              <div className="personal-brain-tag-list">
                {topic_interests.top_keywords.slice(0, 10).map((kw) => (
                  <span key={kw.keyword} className="personal-brain-tag keyword-tag" style={{ fontSize: `${Math.min(0.7 + kw.count * 0.03, 1.0)}rem` }}>
                    {kw.keyword} <span className="personal-brain-tag-count">{kw.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Chat query topics */}
          {topic_interests.top_query_topics.length > 0 && (
            <div className="personal-brain-interest-group">
              <h4 className="personal-brain-interest-label">Chủ đề trong câu hỏi chat</h4>
              <div className="personal-brain-tag-list">
                {topic_interests.top_query_topics.map((qt) => (
                  <span key={qt.topic} className="personal-brain-tag chat-topic-tag">
                    {qt.topic} <span className="personal-brain-tag-count">{qt.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {topic_interests.top_tags.length === 0 && topic_interests.top_keywords.length === 0 && (
            <div className="personal-brain-empty-hint">
              <p>Hãy thêm tags cho papers hoặc bắt đầu chat để AI phân tích sở thích của bạn.</p>
            </div>
          )}
        </div>
      </div>

      {/* Author Preferences */}
      {author_preferences.top_authors.length > 0 && (
        <div className="personal-brain-section">
          <h3 className="personal-brain-section-title">
            <IconWithText icon={IconPenLine} size={16}>Tác giả yêu thích</IconWithText>
          </h3>
          <div className="personal-brain-authors-list">
            {author_preferences.top_authors.map((author) => (
              <div key={author.author} className="personal-brain-author-row">
                <div className="personal-brain-author-name">{author.author}</div>
                <div className="personal-brain-author-bar">
                  <div
                    className="personal-brain-author-bar-fill"
                    style={{ width: `${Math.min(author.count / author_preferences.top_authors[0].count * 100, 100)}%` }}
                  />
                </div>
                <div className="personal-brain-author-count">{author.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reading Timeline */}
      {timeline.length > 0 && (
        <div className="personal-brain-section">
          <h3 className="personal-brain-section-title">
            <IconWithText icon={IconCalendar} size={16}>Lịch sử nhập liệu</IconWithText>
          </h3>
          <div className="personal-brain-timeline">
            {timeline.map((t) => (
              <div key={t.month} className="personal-brain-timeline-item">
                <div className="personal-brain-timeline-month">{t.month}</div>
                <div className="personal-brain-timeline-bar">
                  <div
                    className="personal-brain-timeline-bar-fill"
                    style={{ width: `${Math.min(t.count / Math.max(...timeline.map(x => x.count)) * 100, 100)}%` }}
                  />
                </div>
                <div className="personal-brain-timeline-count">{t.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recent_activity.length > 0 && (
        <div className="personal-brain-section">
          <h3 className="personal-brain-section-title">
            <IconWithText icon={IconClock} size={16}>Hoạt động gần đây</IconWithText>
          </h3>
          <div className="personal-brain-activity-list">
            {recent_activity.slice(0, 5).map((activity, i) => (
              <div key={i} className="personal-brain-activity-item">
                <div className="personal-brain-activity-icon">
                  <IconChat size={14} />
                </div>
                <div className="personal-brain-activity-content">{activity.content}</div>
                <div className="personal-brain-activity-date">
                  {activity.date ? new Date(activity.date).toLocaleDateString("vi-VN") : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
