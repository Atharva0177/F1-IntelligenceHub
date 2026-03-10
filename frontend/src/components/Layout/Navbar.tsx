'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navLinks = [
  { href: '/',          label: 'Dashboard' },
  { href: '/races',     label: 'Races' },
  { href: '/drivers',   label: 'Drivers' },
  { href: '/teams',     label: 'Teams' },
  { href: '/standings', label: 'Standings' },
  { href: '/analytics', label: 'Analytics' },
];

const Navbar = () => {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) => pathname === href;

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-carbon-950/90 backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.05)] border-b border-carbon-800'
          : 'bg-carbon-950/70 backdrop-blur-md border-b border-carbon-800/60'
      }`}
    >
      {/* Top red racing stripe */}
      <div className="h-[2px] w-full bg-gradient-to-r from-racing-red-700 via-racing-red-500 to-racing-red-700" />

      <div className="container mx-auto px-5">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="Home">
            <div className="relative w-9 h-9">
              <div className="absolute inset-0 bg-racing-red-500 rounded-lg blur opacity-60 group-hover:opacity-90 transition-opacity animate-glow" />
              <div className="relative w-9 h-9 bg-gradient-to-br from-racing-red-400 to-racing-red-700 rounded-lg flex items-center justify-center shadow-inner">
                <span className="text-white font-display font-bold text-base leading-none tracking-tight">F1</span>
              </div>
            </div>
            <div className="hidden md:block">
              <span className="text-xl font-display font-bold text-white">Intelligence</span>
              <span className="text-xl font-display font-bold text-gradient-red ml-1">Hub</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3.5 py-1.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  isActive(link.href)
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {isActive(link.href) && (
                  <span className="absolute inset-0 rounded-lg bg-racing-red-500/15 border border-racing-red-500/30" />
                )}
                <span className="relative">
                  {link.label}
                  {isActive(link.href) && (
                    <span className="absolute -bottom-0.5 left-0 right-0 h-px bg-gradient-to-r from-racing-red-500/0 via-racing-red-400 to-racing-red-500/0" />
                  )}
                </span>
              </Link>
            ))}
          </div>

          {/* Live data badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-carbon-800/60 border border-carbon-700 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-track-green animate-pulse" />
            Live Data
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-carbon-800 transition-colors"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 pt-2 border-t border-carbon-800 animate-fade-in-up space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive(link.href)
                    ? 'bg-racing-red-500/15 text-white border border-racing-red-500/25'
                    : 'text-gray-400 hover:text-white hover:bg-carbon-800'
                }`}
              >
                {isActive(link.href) && <span className="w-1.5 h-1.5 rounded-full bg-racing-red-500" />}
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
