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
  Sun,
  Moon,
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
  Plus,
  Brain,
  Bot,
  Cloud,
  Laptop,
  Clipboard,
  ClipboardCheck,
  Info,
  Globe,
  NotebookPen,
  BookMarked,
  Swords,
  CircleDot,
  Tags,
  PenLine,
  Activity,
  Plug,
  Unplug,
  SkipForward,
  RotateCcw,
  FlaskConical,
  Circle,
  PauseCircle,
  ScanSearch,
  FileCode,
  ArrowDown,
  ArrowRight,
  Microscope,
  HelpCircle,
  Rocket,
  Keyboard,
  Bug,
  Mail,
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
export const IconSun = wrapIcon(Sun, "icon-sun");
export const IconMoon = wrapIcon(Moon, "icon-moon");
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
export const IconPlus = wrapIcon(Plus, "icon-plus");
export const IconBrainAi = wrapIcon(Brain, "icon-brain-ai", true);
export const IconBot = wrapIcon(Bot, "icon-bot");
export const IconCloud = wrapIcon(Cloud, "icon-cloud");
export const IconLaptop = wrapIcon(Laptop, "icon-laptop");
export const IconClipboard = wrapIcon(Clipboard, "icon-clipboard");
export const IconClipboardCheck = wrapIcon(ClipboardCheck, "icon-clipboard-check");
export const IconInfo = wrapIcon(Info, "icon-info");
export const IconGlobe = wrapIcon(Globe, "icon-globe");
export const IconNotebookPen = wrapIcon(NotebookPen, "icon-notebook-pen");
export const IconBookMarked = wrapIcon(BookMarked, "icon-book-marked");
export const IconSwords = wrapIcon(Swords, "icon-swords");
export const IconCircleDot = wrapIcon(CircleDot, "icon-circle-dot");
export const IconTags = wrapIcon(Tags, "icon-tags");
export const IconPenLine = wrapIcon(PenLine, "icon-pen-line");
export const IconActivity = wrapIcon(Activity, "icon-activity", true);
export const IconPlug = wrapIcon(Plug, "icon-plug");
export const IconUnplug = wrapIcon(Unplug, "icon-unplug");
export const IconSkipForward = wrapIcon(SkipForward, "icon-skip-forward");
export const IconRotateCcw = wrapIcon(RotateCcw, "icon-rotate-ccw");
export const IconFlask = wrapIcon(FlaskConical, "icon-flask");
export const IconCircle = wrapIcon(Circle, "icon-circle");
export const IconPauseCircle = wrapIcon(PauseCircle, "icon-pause-circle");
export const IconScanSearch = wrapIcon(ScanSearch, "icon-scan-search");
export const IconFileCode = wrapIcon(FileCode, "icon-file-code");
export const IconArrowDown = wrapIcon(ArrowDown, "icon-arrow-down");
export const IconArrowRight = wrapIcon(ArrowRight, "icon-arrow-right");
export const IconMicroscope = wrapIcon(Microscope, "icon-microscope");
export const IconHelp = wrapIcon(HelpCircle, "icon-help");
export const IconRocket = wrapIcon(Rocket, "icon-rocket");
export const IconKeyboard = wrapIcon(Keyboard, "icon-keyboard");
export const IconBug = wrapIcon(Bug, "icon-bug");
export const IconMail = wrapIcon(Mail, "icon-mail");

/** Inline icon + text label */
export const IconWithText: React.FC<{
  icon: React.FC<IconProps>;
  size?: number;
  children: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, size = 14, children, className = "" }) => (
  <span className={`icon-with-text ${className}`.trim()}>
    <Icon size={size} />
    <span>{children}</span>
  </span>
);



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
