import type { MetadataRoute } from "next";

/** What "Add to Home Screen" reads: the name under the icon, full screen, and where it opens. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Perfect Pitch Lab",
    short_name: "Pitch Lab",
    description: "High-rep ear training for absolute pitch: notes, chords, timbres, transcription.",
    start_url: "/trainer",
    scope: "/",
    display: "standalone",
    // The splash and the bar colour before the page paints; the page itself follows the chosen theme (layout.tsx, app-nav.tsx).
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
