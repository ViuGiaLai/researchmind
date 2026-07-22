import React, { useState } from "react";
import { sessionKeyManager, deriveKey } from "../../lib/crypto";

export function MasterPasswordModal({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      // In a real app, salt would be fetched from the cloud or local db
      // For first time setup, it generates a new salt
      const storedSalt = localStorage.getItem("rm_e2ee_salt");
      const { key, salt } = await deriveKey(password, storedSalt || undefined);
      
      if (!storedSalt) {
        localStorage.setItem("rm_e2ee_salt", salt);
      }
      
      sessionKeyManager.setKey(key, salt);
      onUnlock();
    } catch (err) {
      setError("Failed to unlock encryption");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
    }}>
      <form onSubmit={handleSubmit} style={{
        background: "var(--color-surface, #1e293b)", padding: 24, borderRadius: 12,
        width: 340, border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
      }}>
        <h3 style={{ margin: "0 0 8px 0", color: "#fff" }}>Unlock Memory Engine</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: 16 }}>
          Enter your Master Password to decrypt your notes. This key is never sent to the server.
        </p>
        
        <input 
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master Password"
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff", marginBottom: 12, boxSizing: "border-box"
          }}
          autoFocus
        />
        
        {error && <div style={{ color: "#ef4444", fontSize: "0.75rem", marginBottom: 12 }}>{error}</div>}
        
        <button 
          type="submit" 
          disabled={loading || !password}
          style={{
            width: "100%", padding: 10, borderRadius: 8, border: "none",
            background: "var(--color-primary, #2dd4bf)", color: "#000",
            fontWeight: 600, cursor: loading ? "wait" : "pointer"
          }}
        >
          {loading ? "Unlocking..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}
