fn main() {
    // Auto-generate a placeholder icon if icons directory doesn't exist.
    // Windows Resource Compiler (RC) requires at least v3.00 format (32x32).
    let icon_path = std::path::Path::new("icons").join("icon.ico");
    if !icon_path.exists() {
        let _ = std::fs::create_dir_all("icons");

        let mut ico = Vec::new();

        // --- ICO header (6 bytes) ---
        ico.extend_from_slice(&[0x00, 0x00]); // reserved
        ico.extend_from_slice(&[0x01, 0x00]); // type: 1 = icon
        ico.extend_from_slice(&[0x01, 0x00]); // count: 1 image

        // --- Directory entry (16 bytes) ---
        let img_size: u32 = 40 + (32 * 32 * 4) + (4 * 32); // BMPINFOHEADER + XOR mask + AND mask
        let img_offset: u32 = 6 + 16; // header + directory

        ico.push(32); // width
        ico.push(32); // height
        ico.push(0); // colors
        ico.push(0); // reserved
        ico.extend_from_slice(&1u16.to_le_bytes()); // planes
        ico.extend_from_slice(&32u16.to_le_bytes()); // bpp
        ico.extend_from_slice(&img_size.to_le_bytes());
        ico.extend_from_slice(&img_offset.to_le_bytes());

        // --- BITMAPINFOHEADER (40 bytes) ---
        ico.extend_from_slice(&40u32.to_le_bytes()); // biSize
        ico.extend_from_slice(&32i32.to_le_bytes()); // biWidth
        ico.extend_from_slice(&64i32.to_le_bytes()); // biHeight (double: XOR + AND)
        ico.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
        ico.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
        ico.extend_from_slice(&[0u8; 24]); // compression + rest (zeros)

        // --- XOR mask: 32x32 pixels, BGRA, bottom-up ---
        let purple_bgra = [0x8B, 0x5C, 0xF6, 0xFF]; // BGRA purple
        for _ in 0..(32 * 32) {
            ico.extend_from_slice(&purple_bgra);
        }

        // --- AND mask: 1-bit per pixel, opaque (all zeros) ---
        let and_row = [0u8; 4]; // 32 bits = 4 bytes per row, all zeros = opaque
        for _ in 0..32 {
            ico.extend_from_slice(&and_row);
        }

        let _ = std::fs::write(&icon_path, &ico);
    }
    tauri_build::build()
}
