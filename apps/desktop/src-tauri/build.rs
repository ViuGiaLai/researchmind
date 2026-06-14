fn main() {
    // Auto-generate a placeholder icon if icons directory doesn't exist
    // This avoids build failures when icons haven't been created yet
    let icon_path = std::path::Path::new("icons").join("icon.ico");
    if !icon_path.exists() {
        let _ = std::fs::create_dir_all("icons");
        // Minimal valid 1x1 32-bit ICO file (blue pixel)
        let ico_data: &[u8] = &[
            0x00, 0x00, // reserved
            0x01, 0x00, // type: icon
            0x01, 0x00, // count: 1
            // Directory entry
            0x01,       // width: 1
            0x01,       // height: 1
            0x00,       // colors
            0x00,       // reserved
            0x01, 0x00, // planes: 1
            0x20, 0x00, // bpp: 32
            0x30, 0x00, 0x00, 0x00, // size: 48 bytes
            0x16, 0x00, 0x00, 0x00, // offset: 22 bytes
            // BITMAPINFOHEADER (40 bytes)
            0x28, 0x00, 0x00, 0x00, // biSize: 40
            0x01, 0x00, 0x00, 0x00, // biWidth: 1
            0x02, 0x00, 0x00, 0x00, // biHeight: 2 (XOR + AND)
            0x01, 0x00,             // biPlanes: 1
            0x20, 0x00,             // biBitCount: 32
            0x00, 0x00, 0x00, 0x00, // biCompression: 0
            0x00, 0x00, 0x00, 0x00, // biSizeImage: 0
            0x00, 0x00, 0x00, 0x00, // biXPelsPerMeter
            0x00, 0x00, 0x00, 0x00, // biYPelsPerMeter
            0x00, 0x00, 0x00, 0x00, // biClrUsed: 0
            0x00, 0x00, 0x00, 0x00, // biClrImportant: 0
            // XOR mask: 1 pixel BGRA (blue, opaque)
            0x00, 0x00, 0xFF, 0xFF,
            // AND mask: padded to 4 bytes
            0x00, 0x00, 0x00, 0x00,
        ];
        let _ = std::fs::write(&icon_path, ico_data);
    }
    tauri_build::build()
}
