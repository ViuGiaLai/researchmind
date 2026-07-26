import axios from "axios";
import { env } from "./env";

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("rm_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      localStorage.removeItem("rm_token");
    }
    return Promise.reject(error);
  },
);
