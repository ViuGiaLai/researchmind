import React, { useEffect, useState } from "react";
import {
  IconClock,
  IconCalendar,
  IconFolder,
  IconChart,
  IconSpinner,
  IconError,
} from "../Icons";
import { getFileIcon } from "../Icons";
import { useTimeline, TimelineFileEntry } from "../../hooks/useTimeline";

/** Group timeline entries by month period (YYYY-MM). */
function groupByMonth(
  files: TimelineFileEntry[]
): Map<string, TimelineFileEntry[]> {
  const groups = new Map<string, TimelineFileEntry[]>();
  for (const file of files) {
    const period = file.date.slice(0, 7); // "YYYY-MM"
    const existing = groups.get(period);
    if (existing) {
      existing.push(file);
    } else {
      groups.set(period, [file]);
    }
  }
  return groups;
}

const TimelineView: React.FC = () => {
  const { data, loading, error, loadTimeline, formatSize, formatDate, formatPeriod } =
    useTimeline();
  const [dateFilter, setDateFilter] = useState<"all" | "7" | "30" | "90">("all");

  useEffect(() => {
    const days = dateFilter === "all" ? undefined : parseInt(dateFilter, 10);
    const from =
      days !== undefined
        ? new Date(Date.now() - days * 86400000).toISOString().split("T")[0]
        : undefined;
    loadTimeline(from, undefined, 500);
  }, [dateFilter, loadTimeline]);

  const handleRefresh = () => {
    const days = dateFilter === "all" ? undefined : parseInt(dateFilter, 10);
    const from =
      days !== undefined
        ? new Date(Date.now() - days * 86400000).toISOString().split("T")[0]
        : undefined;
    loadTimeline(from, undefined, 500);
  };

  const FileIcon: React.FC<{ ext: string }> = ({ ext }) => {
    const Icon = getFileIcon(ext);
    return <Icon size={16} />;
  };

  return (
    <div className="timeline-view">
      {/* Header */}
      <div className="timeline-header">
        <div className="timeline-header-left">
          <h2 className="timeline-title">
            <IconCalendar size={22} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 8 }} />
            Dòng thời gian
          </h2>
          <p className="timeline-desc">Lịch sử file theo thời gian</p>
        </div>
        <div className="timeline-header-right">
          <div className="timeline-filter-chips">
            {[
              { label: "Tất cả", value: "all" as const },
              { label: "7 ngày", value: "7" as const },
              { label: "30 ngày", value: "30" as const },
              { label: "90 ngày", value: "90" as const },
            ].map((f) => (
              <button
                key={f.value}
                className={`timeline-filter-chip ${
                  dateFilter === f.value ? "active" : ""
                }`}
                onClick={() => setDateFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button className="timeline-refresh-btn" onClick={handleRefresh} title="Làm mới">
            <IconClock size={16} />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="timeline-loading">
          <IconSpinner size={24} />
          <span>Đang tải dữ liệu...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="timeline-error">
          <IconError size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Summary bar */}
      {data && !loading && (
        <div className="timeline-summary-bar">
          <div className="timeline-summary-item">
            <span className="timeline-summary-value">{data.total_days}</span>
            <span className="timeline-summary-label">ngày</span>
          </div>
          <div className="timeline-summary-divider" />
          <div className="timeline-summary-item">
            <span className="timeline-summary-value">{data.total_files}</span>
            <span className="timeline-summary-label">file</span>
          </div>
          <div className="timeline-summary-divider" />
          <div className="timeline-summary-item">
            <span className="timeline-summary-value">
              {formatSize(data.total_size)}
            </span>
            <span className="timeline-summary-label">dung lượng</span>
          </div>
        </div>
      )}

      {/* Content */}
      {data && !loading && data.files.length === 0 && (
        <div className="timeline-empty">
          <IconCalendar size={48} className="timeline-empty-icon" />
          <p>Chưa có dữ liệu timeline.</p>
          <p className="hint">Hãy chọn thư mục và index file để xem lịch sử.</p>
        </div>
      )}

      {data && !loading && data.files.length > 0 && (
        <div className="timeline-content">
          {/* Summary chart */}
          {data.summary.length > 0 && (
            <div className="timeline-chart">
              <h4 className="timeline-chart-title">
                <IconChart size={14} style={{ marginRight: 4 }} />
                Hoạt động theo tháng
              </h4>
              <div className="timeline-chart-bars">
                {data.summary.slice(0, 12).map((s) => {
                  const maxCount = Math.max(...data.summary.map((x) => x.count), 1);
                  const heightPct = (s.count / maxCount) * 100;
                  return (
                    <div
                      key={s.period}
                      className="timeline-chart-bar-group"
                      title={`${formatPeriod(s.period)}: ${s.count} file, ${formatSize(s.total_size)}`}
                    >
                      <div className="timeline-chart-bar-track">
                        <div
                          className="timeline-chart-bar-fill"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="timeline-chart-bar-label">
                        {s.period.slice(5, 7)}/{s.period.slice(2, 4)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timeline entries grouped by month */}
          <div className="timeline-list">
            {Array.from(groupByMonth(data.files).entries()).map(
              ([period, files]) => (
                <div key={period} className="timeline-month-group">
                  <div className="timeline-month-header">
                    <IconCalendar
                      size={16}
                      className="icon-gradient"
                      style={{ marginRight: 6 }}
                    />
                    <h3>{formatPeriod(period)}</h3>
                    <span className="timeline-month-count">
                      {files.length} file
                    </span>
                  </div>
                  <div className="timeline-month-files">
                    {files.map((file) => (
                      <div key={file.file_id} className="timeline-item">
                        <div className="timeline-item-line">
                          <div className="timeline-item-dot" />
                          <div className="timeline-item-line-connector" />
                        </div>
                        <div className="timeline-item-icon">
                          <FileIcon ext={file.extension} />
                        </div>
                        <div className="timeline-item-content">
                          <div className="timeline-item-header">
                            <span className="timeline-item-name">
                              {file.filename}
                            </span>
                            <span className="timeline-item-badge">
                              {file.event_type === "modified"
                                ? "Đã sửa"
                                : "Đã tạo"}
                            </span>
                          </div>
                          <div className="timeline-item-meta">
                            <span className="timeline-item-path">
                              <IconFolder size={12} style={{ marginRight: 2 }} />
                              {file.path}
                            </span>
                            <span className="timeline-item-size">
                              {formatSize(file.size)}
                            </span>
                          </div>
                          <div className="timeline-item-date">
                            <IconClock size={11} style={{ marginRight: 3 }} />
                            {formatDate(file.date)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineView;
