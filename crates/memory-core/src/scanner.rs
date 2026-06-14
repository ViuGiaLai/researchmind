use crate::{FileInfo, ScanConfig};
use chrono::Utc;
use log::{info, warn};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;

/// Scans directories and collects file metadata.
pub struct FileScanner {
    config: ScanConfig,
}

impl FileScanner {
    pub fn new(config: ScanConfig) -> Self {
        Self { config }
    }

    /// Scan a list of folders and return discovered files.
    pub fn scan_folders(&self, folders: &[String]) -> Vec<FileInfo> {
        let mut files = Vec::new();

        for folder in folders {
            let path = Path::new(folder);
            if !path.exists() || !path.is_dir() {
                warn!("Folder does not exist or is not a directory: {}", folder);
                continue;
            }

            info!("Scanning folder: {}", folder);

            for entry in WalkDir::new(folder).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();

                // Skip directories
                if path.is_dir() {
                    continue;
                }

                // Get extension
                let ext = match path.extension() {
                    Some(e) => e.to_string_lossy().to_lowercase(),
                    None => continue,
                };

                // Check if extension is supported
                if !self.config.include_extensions.contains(&ext) {
                    continue;
                }

                // Skip hidden files
                if self.config.exclude_hidden {
                    if let Some(name) = path.file_name() {
                        if name.to_string_lossy().starts_with('.') {
                            continue;
                        }
                    }
                }

                // Get file metadata
                let metadata = match fs::metadata(path) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                // Skip files > max size
                let size = metadata.len();
                if size > self.config.max_file_size_mb * 1024 * 1024 {
                    info!(
                        "File too large, skipped: {} ({} MB)",
                        path.display(),
                        size / 1024 / 1024
                    );
                    continue;
                }

                // Compute SHA-256 hash
                let hash = self.compute_hash(path);

                // Get timestamps
                let created = match metadata.created() {
                    Ok(t) => {
                        let dt: chrono::DateTime<Utc> = t.into();
                        Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    }
                    Err(_) => None,
                };

                let modified = match metadata.modified() {
                    Ok(t) => {
                        let dt: chrono::DateTime<Utc> = t.into();
                        Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    }
                    Err(_) => None,
                };

                let filename = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                files.push(FileInfo {
                    id: Uuid::new_v4().to_string(),
                    path: path.to_string_lossy().to_string(),
                    filename,
                    extension: ext,
                    hash,
                    size,
                    created_at: created,
                    modified_at: modified,
                });
            }

            info!("Found {} files in folder: {}", files.len(), folder);
        }

        files
    }

    /// Compute SHA-256 hash of a file.
    fn compute_hash(&self, path: &Path) -> String {
        let mut file = match fs::File::open(path) {
            Ok(f) => f,
            Err(_) => return String::new(),
        };

        let mut hasher = Sha256::new();
        let mut buffer = [0; 8192];

        loop {
            match file.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => hasher.update(&buffer[..n]),
                Err(_) => break,
            }
        }

        format!("{:x}", hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_empty_folder() {
        let config = ScanConfig::default();
        let scanner = FileScanner::new(config);
        let files = scanner.scan_folders(&[]);
        assert!(files.is_empty());
    }

    #[test]
    fn test_scan_nonexistent_folder() {
        let config = ScanConfig::default();
        let scanner = FileScanner::new(config);
        let files = scanner.scan_folders(&["C:\\nonexistent_path_12345".to_string()]);
        assert!(files.is_empty());
    }
}
