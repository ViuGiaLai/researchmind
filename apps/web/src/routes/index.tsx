import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { ReportLayout } from "@/layouts/ReportLayout";
import { EmptyLayout } from "@/layouts/EmptyLayout";
import { ProtectedRoute } from "./protected";
import { PublicOnly } from "./public";

import LandingPage from "@/pages/Landing";
import PricingPage from "@/pages/Pricing";
import AboutPage from "@/pages/About";
import FeaturesPage from "@/pages/Features";
import DocsPage from "@/pages/Docs";
import BlogPage from "@/pages/Blog";
import DownloadPage from "@/pages/Download";
import ChangelogPage from "@/pages/Changelog";
import ContactPage from "@/pages/Contact";
import PrivacyPage from "@/pages/Privacy";
import TermsPage from "@/pages/Terms";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import VerifyEmailPage from "@/pages/VerifyEmail";
import ForgotPasswordPage from "@/pages/ForgotPassword";
import SsoCallbackPage from "@/pages/SsoCallback";
import DashboardPage from "@/pages/Dashboard";
import WorkspacePage from "@/pages/Workspace";
import ReportsPage from "@/pages/Reports";
import SnapshotsPage from "@/pages/Snapshots";
import ReportViewerPage from "@/pages/ReportViewer";
import ActivityPage from "@/pages/Activity";
import AnalyticsPage from "@/pages/Analytics";
import NotificationsPage from "@/pages/Notifications";
import BackupsPage from "@/pages/Backups";
import DevicesPage from "@/pages/Devices";
import TeamPage from "@/pages/Team";
import BillingPage from "@/pages/Billing";
import SettingsPage from "@/pages/Settings";
import ProfilePage from "@/pages/Profile";
import ApiKeysPage from "@/pages/ApiKeys";
import HelpCenterPage from "@/pages/HelpCenter";
import FeedbackPage from "@/pages/Feedback";
import NotFoundPage from "@/pages/NotFound";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="features" element={<FeaturesPage />} />
        <Route path="download" element={<DownloadPage />} />
        <Route path="blog" element={<BlogPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="changelog" element={<ChangelogPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      <Route path="sso-callback" element={<SsoCallbackPage />} />

      <Route
        path="app"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="workspaces" element={<WorkspacePage />} />
        <Route path="workspaces/:id" element={<WorkspacePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="snapshots" element={<SnapshotsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="help" element={<HelpCenterPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
      </Route>

      <Route element={<ReportLayout />}>
        <Route path="r/:id" element={<ReportViewerPage />} />
      </Route>

      <Route element={<EmptyLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="home" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
