import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Orbit — Business, in sync", description: "A calm, clear workspace for leads and customer relationships." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html> }
