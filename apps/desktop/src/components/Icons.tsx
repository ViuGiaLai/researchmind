import React from "react";
import {
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
  Edit,
  Link,
  AlertTriangle,
  ChevronDown,
  ArrowLeft,
  ListFilter,
  Minus,
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
      strokeWidth={1.4}
    />
  );
  Component.displayName = Icon.displayName;
  return Component;
}

// ---------------------------------------------------------------------------
// Exported icon components
// ---------------------------------------------------------------------------
export const IconBrain: React.FC<IconProps> = ({ size = 20, className = "", style }) => (
  <img
    src="/icon_chatbox.ico"
    alt="brain"
    width={size}
    height={size}
    className={`icon-brain-img ${className}`}
    style={{ width: size, height: size, objectFit: "contain", ...style }}
  />
);
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
export const IconWarning = wrapIcon(AlertTriangle, "icon-warning", true);
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
export const IconEdit = wrapIcon(Edit, "icon-edit");
export const IconLink = wrapIcon(Link, "icon-link");
export const IconChevronDown = wrapIcon(ChevronDown, "icon-chevron-down");
export const IconArrowLeft = wrapIcon(ArrowLeft, "icon-arrow-left");
export const IconFilter = wrapIcon(ListFilter, "icon-filter");
export const IconMinus = wrapIcon(Minus, "icon-minus");



export const IconGraph: React.FC<IconProps> = ({ size = 20, className = "", style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`icon-3d ${className}`}
    style={style}
  >
    <circle cx="5" cy="6" r="3" />
    <circle cx="19" cy="6" r="3" />
    <circle cx="12" cy="18" r="3" />
    <line x1="7" y1="7.5" x2="10" y2="15.5" />
    <line x1="17" y1="7.5" x2="14" y2="15.5" />
    <line x1="5" y1="9" x2="5" y2="12" />
    <line x1="19" y1="9" x2="19" y2="12" />
  </svg>
);

export const IconClear: React.FC<IconProps> = ({ size = 20, className = "", style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`icon-3d ${className}`}
    style={style}
  >
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

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
