import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Tracker",
  description: "Track client change requests and delivery status",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-credit">
          All right received and designed and developed by{" "}
          <a href="https://abdullahnomancse.netlify.app/" target="_blank" rel="noreferrer">
            Abdullah Al Noman
          </a>
        </footer>
      </body>
    </html>
  );
}
