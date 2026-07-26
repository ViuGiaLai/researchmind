import { APP_CONFIG } from "@researchmind/config";

export function publicReportUrl(id: string) {
  return `${APP_CONFIG.cloudUrl}/r/${id}`;
}

export function desktopDownloadUrl() {
  return "https://github.com/ViuGiaLai/researchmind/releases";
}
