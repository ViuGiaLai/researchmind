import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, PersonalBrainResponse } from "../../lib/api";
import { IconBrain, IconSpinner, IconBook, IconStar, IconLibrary, IconChat, IconActivity, IconBulb, IconTags, IconPenLine, IconCalendar, IconClock, IconWithText } from "../Icons";

export const PersonalBrainView: React.FC = () => {
  const { t } = useTranslation();
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
      setError(t("personal_brain.error_loading"));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="personal-brain-view">
        <div className="personal-brain-loading">
          <IconSpinner size={32} />
          <span>{t("personal_brain.loading")}</span>
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
            {t("personal_brain.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { reading_stats, topic_interests, research_profile, author_preferences, timeline, recent_activity, insights } = data;

  return (
    <div className="personal-brain-view">
      {/* Hero */}
      <div className="personal-brain-hero">
        <IconBrain size={40} className="icon-gradient" />
        <h1 className="personal-brain-hero-title">{t("personal_brain.hero_title")}</h1>
        <p className="personal-brain-hero-desc">
          {t("personal_brain.hero_desc")}
        </p>
      </div>

      {/* Reading Stats Overview */}
      <div className="personal-brain-stats-grid">
        <div className="personal-brain-stat-card">
          <div className="personal-brain-stat-icon">
            <IconLibrary size={22} />
          </div>
          <div className="personal-brain-stat-value">{reading_stats.total_papers}</div>
          <div className="personal-brain-stat-label">{t("personal_brain.stat_total")}</div>
        </div>
        <div className="personal-brain-stat-card">
          <div className="personal-brain-stat-icon" style={{ color: "var(--color-success, #22c55e)" }}>
            <IconBook size={22} />
          </div>
          <div className="personal-brain-stat-value">{reading_stats.read_count}</div>
          <div className="personal-brain-stat-label">{t("personal_brain.stat_read")}</div>
        </div>
        <div className="personal-brain-stat-card">
          <div className="personal-brain-stat-icon" style={{ color: "var(--color-warning, #eab308)" }}>
            <IconBook size={22} />
          </div>
          <div className="personal-brain-stat-value">{reading_stats.unread_count}</div>
          <div className="personal-brain-stat-label">{t("personal_brain.stat_unread")}</div>
        </div>
        <div className="personal-brain-stat-card">
          <div className="personal-brain-stat-icon" style={{ color: "var(--color-primary)" }}>
            <IconStar size={22} />
          </div>
          <div className="personal-brain-stat-value">{reading_stats.starred_count}</div>
          <div className="personal-brain-stat-label">{t("personal_brain.stat_favorites")}</div>
        </div>
      </div>

      {/* Reading Progress Bar */}
      <div className="personal-brain-section">
        <h3 className="personal-brain-section-title">
          <IconWithText icon={IconActivity} size={16}>{t("personal_brain.progress_title")}</IconWithText>
        </h3>
        <div className="personal-brain-progress-container">
          <div className="personal-brain-progress-bar">
            <div
              className="personal-brain-progress-fill"
              style={{ width: `${reading_stats.read_percentage}%` }}
            />
          </div>
          <div className="personal-brain-progress-info">
            <span>{t("personal_brain.progress_percent", { pct: reading_stats.read_percentage, read: reading_stats.read_count, total: reading_stats.total_papers })}</span>
            <span>{t("personal_brain.progress_pages", { count: reading_stats.total_pages })}</span>
          </div>
          <div className="personal-brain-progress-metrics">
            <span>{t("personal_brain.progress_avg", { minutes: reading_stats.average_reading_minutes || 0 })}</span>
            <span>{t("personal_brain.progress_total", { minutes: reading_stats.estimated_total_reading_minutes || 0 })}</span>
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
            <IconWithText icon={IconBulb} size={16}>{t("personal_brain.insights_title")}</IconWithText>
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
          <IconWithText icon={IconTags} size={16}>{t("personal_brain.topics_title")}</IconWithText>
        </h3>
        <div className="personal-brain-interests-grid">
          {/* Tags */}
          {topic_interests.top_tags.length > 0 && (
            <div className="personal-brain-interest-group">
              <h4 className="personal-brain-interest-label">{t("personal_brain.tags_label")}</h4>
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
              <h4 className="personal-brain-interest-label">{t("personal_brain.keywords_label")}</h4>
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
              <h4 className="personal-brain-interest-label">{t("personal_brain.query_topics_label")}</h4>
              <div className="personal-brain-tag-list">
                {topic_interests.top_query_topics.map((qt) => (
                  <span key={qt.topic} className="personal-brain-tag chat-topic-tag">
                    {qt.topic} <span className="personal-brain-tag-count">{qt.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {topic_interests.top_tags.length === 0 && topic_interests.top_keywords.length === 0 && topic_interests.top_query_topics.length === 0 && (
            <div className="personal-brain-empty-hint">
              <p>{t("personal_brain.interests_empty")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Research Profile */}
      {research_profile && (
        research_profile.primary_fields.length > 0 ||
        research_profile.top_venues.length > 0 ||
        research_profile.ai_modes.length > 0
      ) && (
        <div className="personal-brain-section">
          <h3 className="personal-brain-section-title">
            <IconWithText icon={IconBulb} size={16}>{t("personal_brain.research_profile_title")}</IconWithText>
          </h3>
          <div className="personal-brain-interests-grid">
            {research_profile.primary_fields.length > 0 && (
              <div className="personal-brain-interest-group">
                <h4 className="personal-brain-interest-label">{t("personal_brain.primary_fields_label")}</h4>
                <div className="personal-brain-tag-list">
                  {research_profile.primary_fields.map((field) => (
                    <span key={field.field} className="personal-brain-tag field-tag">
                      {field.field} <span className="personal-brain-tag-count">{field.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {research_profile.top_venues.length > 0 && (
              <div className="personal-brain-interest-group">
                <h4 className="personal-brain-interest-label">{t("personal_brain.top_venues_label")}</h4>
                <div className="personal-brain-tag-list">
                  {research_profile.top_venues.map((venue) => (
                    <span key={venue.venue} className="personal-brain-tag venue-tag">
                      {venue.venue} <span className="personal-brain-tag-count">{venue.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {research_profile.ai_modes.length > 0 && (
              <div className="personal-brain-interest-group">
                <h4 className="personal-brain-interest-label">{t("personal_brain.ai_modes_label")}</h4>
                <div className="personal-brain-tag-list">
                  {research_profile.ai_modes.map((mode) => (
                    <span key={mode.mode} className="personal-brain-tag ai-mode-tag">
                      {mode.mode} <span className="personal-brain-tag-count">{mode.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Author Preferences */}
      {author_preferences.top_authors.length > 0 && (
        <div className="personal-brain-section">
          <h3 className="personal-brain-section-title">
            <IconWithText icon={IconPenLine} size={16}>{t("personal_brain.authors_title")}</IconWithText>
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
            <IconWithText icon={IconCalendar} size={16}>{t("personal_brain.timeline_title")}</IconWithText>
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
            <IconWithText icon={IconClock} size={16}>{t("personal_brain.activity_title")}</IconWithText>
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
