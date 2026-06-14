use crate::{TimelineEvent, TimelineSummary};
use log::info;
use memory_core::FileInfo;
use rusqlite::{params, Connection};

/// Builds and queries timeline data from file metadata.
pub struct TimelineEngine;

impl TimelineEngine {
    pub fn new() -> Self {
        Self
    }

    /// Add a timeline event from a file.
    pub fn add_event(&self, file: &FileInfo) {
        // Events are stored during indexing — just log for now
        info!("Timeline event added: {} ({})", file.filename, file.modified_at.as_deref().unwrap_or("unknown"));
    }

    /// Get timeline events within a date range.
    pub fn get_events(
        &self,
        conn: &Connection,
        from: Option<&str>,
        to: Option<&str>,
        limit: i64,
    ) -> Result<Vec<TimelineEvent>, String> {
        let mut sql = String::from(
            "SELECT id, date, title, description, file_id, event_type FROM timeline WHERE 1=1",
        );

        if from.is_some() {
            sql.push_str(" AND date >= ?1");
        }
        if to.is_some() {
            sql.push_str(" AND date <= ?2");
        }
        sql.push_str(" ORDER BY date DESC LIMIT ?3");

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

        let events = stmt
            .query_map(
                params![from.unwrap_or("1900-01-01"), to.unwrap_or("2100-01-01"), limit],
                |row| {
                    Ok(TimelineEvent {
                        id: row.get(0)?,
                        date: row.get(1)?,
                        title: row.get(2)?,
                        description: row.get(3)?,
                        file_id: row.get(4)?,
                        event_type: row.get(5)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(events)
    }

    /// Get timeline summary grouped by period (year-month).
    pub fn get_summary(&self, conn: &Connection) -> Result<Vec<TimelineSummary>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT strftime('%Y-%m', modified_at) as period,
                        COUNT(*) as count,
                        SUM(size) as total_size
                 FROM files
                 WHERE modified_at IS NOT NULL
                 GROUP BY period
                 ORDER BY period DESC
                 LIMIT 24",
            )
            .map_err(|e| e.to_string())?;

        let summaries = stmt
            .query_map([], |row| {
                Ok(TimelineSummary {
                    period: row.get(0)?,
                    count: row.get(1)?,
                    total_size: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(summaries)
    }

    /// Get events for a specific file.
    pub fn get_file_events(
        &self,
        conn: &Connection,
        file_id: &str,
    ) -> Result<Vec<TimelineEvent>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, date, title, description, file_id, event_type
                 FROM timeline WHERE file_id = ?1 ORDER BY date DESC",
            )
            .map_err(|e| e.to_string())?;

        let events = stmt
            .query_map(params![file_id], |row| {
                Ok(TimelineEvent {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    file_id: row.get(4)?,
                    event_type: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(events)
    }
}
