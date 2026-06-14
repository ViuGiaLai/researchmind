use crate::{GraphData, GraphEdge, GraphNode};
use log::info;
use rusqlite::{params, Connection};
use uuid::Uuid;

/// Manages the knowledge graph — nodes and edges.
pub struct KnowledgeGraph;

impl KnowledgeGraph {
    pub fn new() -> Self {
        Self
    }

    /// Create a node in the graph.
    pub fn create_node(
        &self,
        conn: &Connection,
        label: &str,
        name: &str,
        description: Option<&str>,
        file_id: Option<&str>,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO graph_nodes (id, label, name, description, file_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, label, name, description, file_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(id)
    }

    /// Create an edge between two nodes.
    pub fn create_edge(
        &self,
        conn: &Connection,
        source_id: &str,
        target_id: &str,
        relation: &str,
        weight: f64,
    ) -> Result<i64, String> {
        conn.execute(
            "INSERT INTO graph_edges (source_id, target_id, relation, weight)
             VALUES (?1, ?2, ?3, ?4)",
            params![source_id, target_id, relation, weight],
        )
        .map_err(|e| e.to_string())?;

        Ok(conn.last_insert_rowid())
    }

    /// Get the entire graph for visualization.
    pub fn get_graph(&self, conn: &Connection) -> Result<GraphData, String> {
        let nodes = self.get_all_nodes(conn)?;
        let edges = self.get_all_edges(conn)?;
        Ok(GraphData { nodes, edges })
    }

    /// Get all nodes.
    pub fn get_all_nodes(&self, conn: &Connection) -> Result<Vec<GraphNode>, String> {
        let mut stmt = conn
            .prepare("SELECT id, label, name, description, file_id FROM graph_nodes ORDER BY name")
            .map_err(|e| e.to_string())?;

        let nodes = stmt
            .query_map([], |row| {
                Ok(GraphNode {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    file_id: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(nodes)
    }

    /// Get all edges.
    pub fn get_all_edges(&self, conn: &Connection) -> Result<Vec<GraphEdge>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, source_id, target_id, relation, weight FROM graph_edges ORDER BY weight DESC",
            )
            .map_err(|e| e.to_string())?;

        let edges = stmt
            .query_map([], |row| {
                Ok(GraphEdge {
                    id: row.get(0)?,
                    source_id: row.get(1)?,
                    target_id: row.get(2)?,
                    relation: row.get(3)?,
                    weight: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(edges)
    }

    /// Get a single node by ID.
    pub fn get_node(&self, conn: &Connection, node_id: &str) -> Result<Option<GraphNode>, String> {
        let mut stmt = conn
            .prepare("SELECT id, label, name, description, file_id FROM graph_nodes WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query_map(params![node_id], |row| {
                Ok(GraphNode {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    file_id: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;

        Ok(rows.next().and_then(|r| r.ok()))
    }

    /// Search graph nodes by name.
    pub fn search_nodes(
        &self,
        conn: &Connection,
        query: &str,
    ) -> Result<Vec<GraphNode>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, label, name, description, file_id FROM graph_nodes
                 WHERE name LIKE ?1 OR description LIKE ?1
                 LIMIT 20",
            )
            .map_err(|e| e.to_string())?;

        let nodes = stmt
            .query_map(params![format!("%{}%", query)], |row| {
                Ok(GraphNode {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    file_id: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(nodes)
    }

    /// Count total nodes.
    pub fn count_nodes(&self, conn: &Connection) -> Result<i64, String> {
        conn.query_row("SELECT COUNT(*) FROM graph_nodes", [], |row| row.get(0))
            .map_err(|e| e.to_string())
    }

    /// Count total edges.
    pub fn count_edges(&self, conn: &Connection) -> Result<i64, String> {
        conn.query_row("SELECT COUNT(*) FROM graph_edges", [], |row| row.get(0))
            .map_err(|e| e.to_string())
    }
}
