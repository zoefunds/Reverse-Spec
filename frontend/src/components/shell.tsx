"use client";

/** App shell: sidebar navigation + top bar + footer (shared by all pages). */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo, LogoMark } from "@/components/logo";
import { Button } from "@/components/ui";
import { shortAddress } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const NAV = [
  { href: "/explorer", label: "Explorer", icon: "◈" },
  { href: "/dashboard", label: "Dashboard", icon: "▤" },
  { href: "/rewards", label: "Rewards", icon: "◇" },
  { href: "/profile", label: "Profile", icon: "◉" },
] as const;

export function WalletButton() {
  const { address, connect, connecting, disconnect } = useWallet();
  if (address) {
    return (
      <button onClick={disconnect}
        className="rounded border border-line bg-surface-high px-3 py-1.5 font-mono text-label text-ink hover:border-primary/40"
        title="Disconnect">
        {shortAddress(address)}
      </button>
    );
  }
  return (
    <Button onClick={connect} busy={connecting}>Connect Wallet</Button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line-soft bg-surface-lowest p-4 md:flex">
        <Link href="/" className="mb-8 block px-1"><Logo /></Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 rounded px-3 py-2 font-mono text-label transition-colors ${
                  active
                    ? "bg-primary-strong text-primary-onstrong"
                    : "text-ink-soft hover:bg-surface-high hover:text-ink"
                }`}>
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <Button href="/create" className="w-full">+ Create Bounty</Button>
          <div className="border-t border-line-soft pt-3">
            <Link href="/how-it-works"
              className="block px-1 py-1 font-mono text-tag text-ink-faint hover:text-primary">
              HOW IT WORKS
            </Link>
            <a href="https://docs.genlayer.com" target="_blank" rel="noreferrer"
              className="block px-1 py-1 font-mono text-tag text-ink-faint hover:text-primary">
              GENLAYER DOCS ↗
            </a>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line-soft bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-shell items-center justify-between gap-4 px-4 md:px-8">
            <Link href="/" className="md:hidden"><LogoMark /></Link>
            <div className="hidden font-mono text-tag uppercase tracking-widest text-ink-faint md:block">
              Solve the better problem
            </div>
            <WalletButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-shell flex-1 px-4 py-8 md:px-8 pb-24 md:pb-8">
          {children}
        </main>

        <footer className="border-t border-line-soft bg-surface-lowest">
          <div className="mx-auto flex w-full max-w-shell flex-col items-center justify-between gap-2 px-4 py-5 text-sm text-ink-faint md:flex-row md:px-8">
            <span>© 2026 ReverseSpec — powered by GenLayer Intelligent Contracts</span>
            <div className="flex gap-5 font-mono text-tag">
              <Link href="/how-it-works" className="hover:text-primary">HOW IT WORKS</Link>
              <a href="https://studio.genlayer.com" target="_blank" rel="noreferrer" className="hover:text-primary">STUDIONET</a>
              <a href="https://docs.genlayer.com" target="_blank" rel="noreferrer" className="hover:text-primary">DOCS</a>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-line-soft bg-surface-lowest py-2 md:hidden">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 font-mono text-tag ${
                active ? "text-primary" : "text-ink-faint"
              }`}>
              <span aria-hidden className="text-body">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
