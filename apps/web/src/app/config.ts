import { APP_CONFIG, ROUTES } from "@researchmind/config";
import { env } from "@/lib/env";

export const appConfig = {
  ...APP_CONFIG,
  env,
  routes: ROUTES,
};
