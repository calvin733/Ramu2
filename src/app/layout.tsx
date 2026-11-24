import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RAMU", template: "%s · RAMU" },
  description:
    "Baca kondisi usaha hari ini dari catatan penjualan yang sudah Anda miliki.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
