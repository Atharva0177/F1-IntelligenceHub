import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Layout/Navbar'

export const metadata: Metadata = {
  title: 'F1 Intelligence Hub',
  description: 'Comprehensive Formula 1 analytics platform with data engineering, ML predictions, and interactive visualizations',
  keywords: 'Formula 1, F1, Analytics, Data Science, Machine Learning, Racing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {/* Layered background: deep black + subtle dot grid + speed-line overlay */}
        <div className="min-h-screen bg-carbon-950 relative">
          {/* Dot grid texture */}
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
          {/* Wide red ambient glow top-center */}
          <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[60vw] h-[30vh] bg-racing-red-700/10 blur-[120px] rounded-full pointer-events-none" />
          <Navbar />
          <main className="container mx-auto px-4 py-8 relative z-10">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
