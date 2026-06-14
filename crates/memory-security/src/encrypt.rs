use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use log::info;
use rand::RngCore;

/// Handles AES-256-GCM encryption and Argon2id key derivation.
pub struct Encryptor;

impl Encryptor {
    pub fn new() -> Self {
        Self
    }

    /// Derive a 256-bit key from a password using Argon2id.
    pub fn derive_key(password: &str, salt: &[u8]) -> Result<Vec<u8>, String> {
        let mut key = vec![0u8; 32]; // 256-bit key
        let argon2 = Argon2::default();

        argon2
            .hash_password_into(password.as_bytes(), salt, &mut key)
            .map_err(|e| format!("Key derivation failed: {}", e))?;

        Ok(key)
    }

    /// Generate a random salt (16 bytes).
    pub fn generate_salt() -> Vec<u8> {
        let mut salt = vec![0u8; 16];
        OsRng.fill_bytes(&mut salt);
        salt
    }

    /// Generate a random nonce (12 bytes for AES-256-GCM).
    pub fn generate_nonce() -> Vec<u8> {
        let mut nonce = vec![0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        nonce
    }

    /// Encrypt plaintext using AES-256-GCM.
    /// Returns base64-encoded (nonce + ciphertext) string.
    pub fn encrypt(plaintext: &str, key: &[u8]) -> Result<String, String> {
        let cipher =
            Aes256Gcm::new_from_slice(key).map_err(|e| format!("Invalid key: {}", e))?;

        let nonce_bytes = Self::generate_nonce();
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption failed: {}", e))?;

        // Combine nonce + ciphertext for storage
        let mut combined = Vec::new();
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);

        Ok(BASE64.encode(&combined))
    }

    /// Decrypt base64-encoded (nonce + ciphertext) using AES-256-GCM.
    pub fn decrypt(encrypted: &str, key: &[u8]) -> Result<String, String> {
        let combined = BASE64
            .decode(encrypted)
            .map_err(|e| format!("Base64 decode failed: {}", e))?;

        if combined.len() < 12 {
            return Err("Invalid encrypted data: too short".to_string());
        }

        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let cipher =
            Aes256Gcm::new_from_slice(key).map_err(|e| format!("Invalid key: {}", e))?;

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("Decryption failed: {}", e))?;

        String::from_utf8(plaintext).map_err(|e| format!("UTF-8 conversion failed: {}", e))
    }

    /// Encrypt the SQLite database file (simplified — re-encrypts on close).
    pub fn encrypt_database(db_path: &str, password: &str) -> Result<String, String> {
        let salt = Self::generate_salt();
        let key = Self::derive_key(password, &salt)?;

        let db_content =
            std::fs::read(db_path).map_err(|e| format!("Failed to read database: {}", e))?;

        let plaintext = BASE64.encode(&db_content);
        let encrypted = Self::encrypt(&plaintext, &key)?;

        // Store salt + encrypted data
        let mut result = Vec::new();
        result.extend_from_slice(&salt);
        result.extend_from_slice(&BASE64.decode(&encrypted).unwrap_or_default());

        let output_path = format!("{}.encrypted", db_path);
        std::fs::write(&output_path, &result)
            .map_err(|e| format!("Failed to write encrypted file: {}", e))?;

        info!("Database encrypted to: {}", output_path);
        Ok(output_path)
    }

    /// Decrypt and restore the SQLite database.
    pub fn decrypt_database(encrypted_path: &str, password: &str) -> Result<Vec<u8>, String> {
        let data =
            std::fs::read(encrypted_path).map_err(|e| format!("Failed to read encrypted file: {}", e))?;

        if data.len() < 16 {
            return Err("Invalid encrypted file".to_string());
        }

        let (salt, encrypted_data) = data.split_at(16);
        let key = Self::derive_key(password, salt)?;

        let encrypted_b64 = BASE64.encode(encrypted_data);
        let decoded = Self::decrypt(&encrypted_b64, &key)?;

        BASE64
            .decode(&decoded)
            .map_err(|e| format!("Failed to decode database content: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let password = "my-secret-password";
        let salt = Encryptor::generate_salt();
        let key = Encryptor::derive_key(password, &salt).unwrap();

        let plaintext = "This is sensitive data about MemoryOS";
        let encrypted = Encryptor::encrypt(plaintext, &key).unwrap();
        let decrypted = Encryptor::decrypt(&encrypted, &key).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_different_passwords_fail() {
        let password1 = "correct-password";
        let password2 = "wrong-password";
        let salt = Encryptor::generate_salt();
        let key1 = Encryptor::derive_key(password1, &salt).unwrap();
        let key2 = Encryptor::derive_key(password2, &salt).unwrap();

        let plaintext = "Secret data";
        let encrypted = Encryptor::encrypt(plaintext, &key1).unwrap();
        let result = Encryptor::decrypt(&encrypted, &key2);
        assert!(result.is_err());
    }

    #[test]
    fn test_generate_salt() {
        let salt1 = Encryptor::generate_salt();
        let salt2 = Encryptor::generate_salt();
        assert_ne!(salt1, salt2);
        assert_eq!(salt1.len(), 16);
    }
}
