import "./globals.css";
import { Inter, Source_Serif_4 } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "StudyBase — Berkeley coursework, taught back at you",
  description:
    "An AI study tutor that explains like a textbook, draws interactive " +
    "diagrams, and surfaces real Berkeley course resources.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
