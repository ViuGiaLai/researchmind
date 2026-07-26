import React from "react";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { clerkConfigured, clerkPublishableKey } from "@/lib/clerk";

function InnerProviders({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (clerkConfigured) {
    return (
      <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
        <InnerProviders>{children}</InnerProviders>
      </ClerkProvider>
    );
  }
  return <InnerProviders>{children}</InnerProviders>;
}
