import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smith - AI Technical Consultant",
  description: "Speculative Turn-taking S2S Agent for Requirements Definition",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
