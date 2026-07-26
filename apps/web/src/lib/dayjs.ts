import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/vi";
import "dayjs/locale/en";

dayjs.extend(relativeTime);

export function setDayjsLocale(locale: "en" | "vi") {
  dayjs.locale(locale);
}

export { dayjs };
