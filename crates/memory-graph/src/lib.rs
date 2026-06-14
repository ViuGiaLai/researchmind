pub mod graph;
pub mod timeline;
pub mod relation;

pub use graph::KnowledgeGraph;
pub use timeline::TimelineEngine;
pub use relation::RelationExtractor;

use serde::{Deserialize, Serialize};

/// A node in the knowledge graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub name: String,
    pub description: Option<String>,
    pub file_id: Option<String>,
}

/// An edge connecting two nodes in the knowledge graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: i64,
    pub source_id: String,
    pub target_id: String,
    pub relation: String,
    pub weight: f64,
}

/// Complete graph data for the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// A timeline event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEvent {
    pub id: i64,
    pub date: String,
    pub title: String,
    pub description: Option<String>,
    pub file_id: Option<String>,
    pub event_type: Option<String>,
}

/// Summary of a time period.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineSummary {
    pub period: String,
    pub count: i64,
    pub total_size: i64,
}

/// A file-based timeline entry (from the files table).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineFileEntry {
    pub date: String,
    pub file_id: String,
    pub filename: String,
    pub path: String,
    pub extension: String,
    pub size: i64,
    pub event_type: String,
}

/// Combined timeline response for the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineData {
    pub files: Vec<TimelineFileEntry>,
    pub summary: Vec<TimelineSummary>,
    pub total_days: i64,
    pub total_files: i64,
    pub total_size: i64,
}
