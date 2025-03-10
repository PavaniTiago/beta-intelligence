import { EnvVarWarning } from "@/components/env-var-warning"
import HeaderAuth from "@/components/header-auth"
import { hasEnvVars } from "@/utils/supabase/check-env-vars"
import { Geist } from "next/font/google"
import { ThemeProvider } from "next-themes"
import "./globals.css"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarMenuLayout } from "@/components/sidebar-menu-layout"
import { QueryProvider } from "@/providers/query-provider"

const defaultUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL 
  ? `https://${process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL}` 
  : typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Beta Intelligence",
  description: "Beta Intelligence is a platform for data-driven decision-making",
}

const geistSans = Geist({
  display: "swap",
  subsets: ["latin"],
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-br" className={geistSans.className} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <QueryProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light" disableTransitionOnChange>
            <SidebarProvider>
              <div className="flex h-screen w-full">
                <SidebarMenuLayout />
                <SidebarInset className="flex-1 w-full overflow-auto">
                  <main className="min-h-screen w-full flex flex-col">
                    <nav className="w-full flex justify-between items-center border-b border-b-foreground/10 h-16 px-4">
                      <SidebarTrigger />
                      <div className="flex items-center gap-4">
                        {!hasEnvVars ? <EnvVarWarning /> : <HeaderAuth />}
                      </div>
                    </nav>
                    <div className="flex-1 h-full flex flex-col items-center p-5">
                      <div className="flex flex-col w-full h-full">{children}</div>
                    </div>
                  </main>
                </SidebarInset>
              </div>
            </SidebarProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}