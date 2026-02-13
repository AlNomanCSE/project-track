import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Tracker Agent",
  description: "Track client change requests and delivery status"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
