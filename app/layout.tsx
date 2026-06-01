// app/layout.tsx
import Link from "next/link";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex">
          <aside className="w-56 border-r min-h-screen p-4 space-y-3">
            <div className="text-sm font-semibold">
              music-intelligence-bot
            </div>
            <nav className="flex flex-col gap-2 text-sm">
              <Link
                href="/"
                className="hover:underline"
              >
                Home
              </Link>
              <Link
                href="/artists"
                className="hover:underline"
              >
                Artists
              </Link>
              {/* add other nav items */}
            </nav>
          </aside>
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
