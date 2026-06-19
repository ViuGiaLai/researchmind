import React from "react";
import {
  Brain,
  Search,
  Menu,
  X,
  FileText,
  Image,
  Folder,
  FolderOpen,
  BarChart3,
  Settings,
  Star,
  Clock,
  CalendarDays,
  MessageSquare,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Lock,
  User,
  Paperclip,
  Square,
  ArrowUp,
  Lightbulb,
  Sparkles,
  Container,
  Bookmark,
  Upload,
  Download,
  Zap,
  Key,
  Monitor,
  Cpu,
  Eye,
  EyeOff,
  PartyPopper,
  Library,
  BookOpen,
  Book,
  Copy,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Icon wrapper with 3D-like / gradient styling
// ---------------------------------------------------------------------------
interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

function wrapIcon(
  Icon: LucideIcon,
  defaultClassName = "",
  gradient = false
): React.FC<IconProps> {
  const Component: React.FC<IconProps> = ({
    size = 20,
    className = "",
    style,
  }) => (
    <Icon
      size={size}
      className={`icon-3d ${gradient ? "icon-gradient" : ""} ${defaultClassName} ${className}`}
      style={style}
      strokeWidth={1.75}
    />
  );
  Component.displayName = Icon.displayName;
  return Component;
}

// ---------------------------------------------------------------------------
// Exported icon components
// ---------------------------------------------------------------------------
export const IconBrain = wrapIcon(Brain, "icon-brain", true);
export const IconSearch = wrapIcon(Search, "icon-search");
export const IconMenu = wrapIcon(Menu, "icon-menu");
export const IconClose = wrapIcon(X, "icon-close");
export const IconFileText = wrapIcon(FileText, "icon-file-text");
export const IconFileImage = wrapIcon(Image, "icon-file-image");
export const IconFolder = wrapIcon(Folder, "icon-folder");
export const IconFolderOpen = wrapIcon(FolderOpen, "icon-folder-open");
export const IconChart = wrapIcon(BarChart3, "icon-chart", true);
export const IconSettings = wrapIcon(Settings, "icon-settings");
export const IconStar = wrapIcon(Star, "icon-star");
export const IconClock = wrapIcon(Clock, "icon-clock");
export const IconChat = wrapIcon(MessageSquare, "icon-chat", true);
export const IconTrash = wrapIcon(Trash2, "icon-trash");
export const IconRefresh = wrapIcon(RefreshCw, "icon-refresh");
export const IconSpinner: React.FC<IconProps> = ({ size = 20, className = "", ...rest }) => (
  <IconSpin size={size} className={`${className}`} {...rest} />
);
export const IconCheck = wrapIcon(CheckCircle2, "icon-check", true);
export const IconError = wrapIcon(XCircle, "icon-error");
export const IconLock = wrapIcon(Lock, "icon-lock");
export const IconUser = wrapIcon(User, "icon-user");
export const IconClip = wrapIcon(Paperclip, "icon-clip");
export const IconStop = wrapIcon(Square, "icon-stop");
export const IconSend = wrapIcon(ArrowUp, "icon-send");
export const IconBulb = wrapIcon(Lightbulb, "icon-bulb", true);
export const IconSparkle = wrapIcon(Sparkles, "icon-sparkle", true);
export const IconCalendar = wrapIcon(CalendarDays, "icon-calendar", true);
export const IconDocker = wrapIcon(Container, "icon-docker");
export const IconBookmark = wrapIcon(Bookmark, "icon-bookmark");
export const IconUpload = wrapIcon(Upload, "icon-upload");
export const IconDashboard = wrapIcon(BarChart3, "icon-dashboard", true);
export const IconZap = wrapIcon(Zap, "icon-zap", true);
export const IconKey = wrapIcon(Key, "icon-key");
export const IconMonitor = wrapIcon(Monitor, "icon-monitor");
export const IconCpu = wrapIcon(Cpu, "icon-cpu");
export const IconEye = wrapIcon(Eye, "icon-eye");
export const IconEyeOff = wrapIcon(EyeOff, "icon-eye-off");
export const IconParty = wrapIcon(PartyPopper, "icon-party", true);
export const IconLibrary = wrapIcon(Library, "icon-library", true);
export const IconBook = wrapIcon(Book, "icon-book");
export const IconBookOpen = wrapIcon(BookOpen, "icon-book-open");
export const IconDownload = wrapIcon(Download, "icon-download");
export const IconCopy = wrapIcon(Copy, "icon-copy");

// ---------------------------------------------------------------------------
// Non-wrapped icons with special behaviour
// ---------------------------------------------------------------------------
const IconSpin: React.FC<IconProps> = ({ size = 20 }) => (
  <Loader2 size={size} className="icon-spin" strokeWidth={1.75} />
);

// ---------------------------------------------------------------------------
// File-type icon resolver
// ---------------------------------------------------------------------------
const fileIconMap: Record<string, React.FC<IconProps>> = {
  pdf: IconFileText,
  docx: IconFileText,
  txt: IconFileText,
  md: IconBookmark,
  jpg: IconFileImage,
  png: IconFileImage,
};

export function getFileIcon(ext: string): React.FC<IconProps> {
  return fileIconMap[ext] || IconFileText;
}
