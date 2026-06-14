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
