export async function uploadFile(file: File): Promise<{ url: string; name: string; size: number }> {
  // Placeholder — cloud upload endpoint later
  return {
    url: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
  };
}
