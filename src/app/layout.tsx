import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppToaster } from "@/components/app-toaster";
import { AppNav } from "@/components/app-nav";
import { AudioWatch } from "@/components/audio-watch";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Perfect Pitch Lab",
  description: "High-rep ear training for absolute pitch: notes, chords, timbres, transcription.",
  applicationName: "Perfect Pitch Lab",
  // Add to Home Screen on the iPhone: opens full screen with its own icon. The manifest is app/manifest.ts.
  appleWebApp: { capable: true, title: "Pitch Lab", statusBarStyle: "black-translucent" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  formatDetection: { telephone: false },
  // Next writes the standard "mobile-web-app-capable"; iOS before 17 only knows the prefixed one.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // An app, not a document: no pinch zoom, and no zoom when a field takes focus.
  maximumScale: 1,
  userScalable: false,
  // Draw into the notch and home-indicator areas; globals.css and the nav pad them back with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider>
            <AppNav />
            {/* Below md the nav is a fixed bar at the bottom, so the page ends above it. */}
            <main className="mx-auto w-full max-w-6xl flex-1 px-2 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 md:py-6">{children}</main>
            <AppToaster />
            <AudioWatch />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
