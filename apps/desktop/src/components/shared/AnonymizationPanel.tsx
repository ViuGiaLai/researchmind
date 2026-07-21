/**
 * AnonymizationPanel — Bảng điều khiển ẩn danh hóa bài báo.
 *
 * Hiển thị trong Paper detail view, cho phép:
 * - Bật/Tắt chế độ ẩn danh với 1 click
 * - Xem danh sách các entity đã được phát hiện và ẩn danh
 * - Chạy lại anonymization (force refresh)
 * - Xóa map ẩn danh
 */

import { useState, useEffect, useCallback } from "react";
import { anonymization, type AnonymizationStatus, type EntityMapResponse } from "../../lib/api";

// ─── Icons ────────────────────────────────────────────────────────

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const IconShieldOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19.7 14a6.9 6.9 0 0 0 .3-2V5l-8-3-3.2 1.2"/>
    <path d="M4.7 4.7 4 5v7a11.5 11.5 0 0 0 6.9 9.4"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
);

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

// ─── Entity type colors ───────────────────────────────────────────

const ENTITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  AUTHOR:      { bg: "rgba(99,102,241,0.12)",  text: "#818cf8", label: "Tác giả" },
  INSTITUTION: { bg: "rgba(16,185,129,0.12)",  text: "#34d399", label: "Tổ chức" },
  EMAIL:       { bg: "rgba(245,158,11,0.12)",  text: "#fbbf24", label: "Email" },
  GRANT:       { bg: "rgba(239,68,68,0.12)",   text: "#f87171", label: "Grant" },
  PROJECT:     { bg: "rgba(59,130,246,0.12)",  text: "#60a5fa", label: "Dự án" },
  ORCID:       { bg: "rgba(168,85,247,0.12)",  text: "#c084fc", label: "ORCID" },
  DOI_AUTHOR:  { bg: "rgba(20,184,166,0.12)",  text: "#2dd4bf", label: "DOI Author" },
};

// ─── Component ───────────────────────────────────────────────────

interface Props {
  paperId: string;
  /** Callback khi trạng thái ẩn danh thay đổi (để parent cập nhật AI context) */
  onStatusChange?: (isActive: boolean) => void;
}

export function AnonymizationPanel({ paperId, onStatusChange }: Props) {
  const [status, setStatus] = useState<AnonymizationStatus | null>(null);
  const [entityMap, setEntityMap] = useState<EntityMapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEntities, setShowEntities] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Load status on mount
  useEffect(() => {
    if (!paperId) return;
    anonymization.getStatus(paperId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [paperId]);

  const handleToggle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await anonymization.toggle(paperId);
      setStatus(result);
      onStatusChange?.(result.is_active);
      // Load entity map when activating for the first time
      if (result.is_active && result.has_map) {
        const map = await anonymization.getMap(paperId);
        setEntityMap(map);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Đã xảy ra lỗi");
    } finally {
      setLoading(false);
    }
  }, [paperId, onStatusChange]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await anonymization.run(paperId, true);
      setStatus(result);
      onStatusChange?.(result.is_active);
      const map = await anonymization.getMap(paperId);
      setEntityMap(map);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chạy lại thất bại");
    } finally {
      setLoading(false);
    }
  }, [paperId, onStatusChange]);

  const handleDelete = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await anonymization.remove(paperId);
      setStatus(null);
      setEntityMap(null);
      setShowConfirmDelete(false);
      onStatusChange?.(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Xóa thất bại");
    } finally {
      setLoading(false);
    }
  }, [paperId, onStatusChange]);

  const handleShowEntities = useCallback(async () => {
    if (!showEntities && !entityMap && status?.has_map) {
      try {
        const map = await anonymization.getMap(paperId);
        setEntityMap(map);
      } catch {
        /* ignore */
      }
    }
    setShowEntities((v) => !v);
  }, [showEntities, entityMap, status, paperId]);

  const isActive = status?.is_active ?? false;
  const hasMap   = status?.has_map ?? false;

  // Group entities by type for display
  const entitiesByType = entityMap
    ? Object.entries(entityMap.entities).reduce<Record<string, Array<{ original: string; label: string; count: number }>>>(
        (acc, [original, info]) => {
          const t = info.entity_type;
          if (!acc[t]) acc[t] = [];
          acc[t].push({ original, label: info.label, count: info.count });
          return acc;
        },
        {}
      )
    : {};

  return (
    <div className="anon-panel" data-active={isActive}>
      {/* ─── Header ─────────────────────────────────────── */}
      <div className="anon-panel__header">
        <div className="anon-panel__title">
          <span className={`anon-panel__icon ${isActive ? "anon-panel__icon--active" : ""}`}>
            {isActive ? <IconShield /> : <IconShieldOff />}
          </span>
          <span className="anon-panel__label">Chế độ Ẩn danh</span>
          {isActive && (
            <span className="anon-panel__badge">
              🔒 Đang bật · {status?.entities_found ?? 0} entities
            </span>
          )}
        </div>

        <div className="anon-panel__actions">
          {hasMap && (
            <>
              <button
                className="anon-panel__btn anon-panel__btn--icon"
                onClick={handleRefresh}
                disabled={loading}
                title="Chạy lại phân tích"
              >
                <IconRefresh />
              </button>
              <button
                className="anon-panel__btn anon-panel__btn--icon anon-panel__btn--danger"
                onClick={() => setShowConfirmDelete(true)}
                disabled={loading}
                title="Xóa map ẩn danh"
              >
                <IconTrash />
              </button>
            </>
          )}
          <button
            className={`anon-panel__toggle ${isActive ? "anon-panel__toggle--active" : ""}`}
            onClick={handleToggle}
            disabled={loading}
          >
            {loading ? (
              <span className="anon-panel__spinner" />
            ) : isActive ? (
              "Tắt"
            ) : hasMap ? (
              "Bật lại"
            ) : (
              "Bật & Quét"
            )}
          </button>
        </div>
      </div>

      {/* ─── Error ──────────────────────────────────────── */}
      {error && (
        <div className="anon-panel__error">⚠ {error}</div>
      )}

      {/* ─── Stats ──────────────────────────────────────── */}
      {isActive && status && status.entities_found > 0 && (
        <div className="anon-panel__stats">
          {Object.entries(status.stats).map(([type, count]) => {
            if (!count) return null;
            const color = ENTITY_COLORS[type] || { bg: "rgba(120,120,120,0.1)", text: "#9ca3af", label: type };
            return (
              <span key={type} className="anon-panel__stat-badge" style={{ background: color.bg, color: color.text }}>
                {color.label}: {count}
              </span>
            );
          })}
        </div>
      )}

      {/* ─── Entity list toggle ──────────────────────────── */}
      {hasMap && (
        <button className="anon-panel__entities-toggle" onClick={handleShowEntities}>
          <IconChevron open={showEntities} />
          <span>{showEntities ? "Ẩn" : "Xem"} danh sách entity đã ẩn danh</span>
        </button>
      )}

      {/* ─── Entity list ─────────────────────────────────── */}
      {showEntities && entityMap && (
        <div className="anon-panel__entity-list">
          {Object.entries(entitiesByType).map(([type, items]) => {
            const color = ENTITY_COLORS[type] || { bg: "rgba(120,120,120,0.1)", text: "#9ca3af", label: type };
            return (
              <div key={type} className="anon-panel__entity-group">
                <div className="anon-panel__entity-group-title" style={{ color: color.text }}>
                  {color.label}
                </div>
                {items.map((item) => (
                  <div key={item.original} className="anon-panel__entity-row">
                    <span className="anon-panel__entity-original">{item.original}</span>
                    <span className="anon-panel__entity-arrow">→</span>
                    <span className="anon-panel__entity-label" style={{ color: color.text }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          {Object.keys(entitiesByType).length === 0 && (
            <p className="anon-panel__empty">Chưa phát hiện entity nào.</p>
          )}
        </div>
      )}

      {/* ─── Confirm delete ──────────────────────────────── */}
      {showConfirmDelete && (
        <div className="anon-panel__confirm">
          <p>Xóa map ẩn danh? Hành động này không thể hoàn tác.</p>
          <div className="anon-panel__confirm-actions">
            <button
              className="anon-panel__btn anon-panel__btn--danger"
              onClick={handleDelete}
              disabled={loading}
            >
              Xác nhận xóa
            </button>
            <button
              className="anon-panel__btn"
              onClick={() => setShowConfirmDelete(false)}
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
