"use client";

/**
 * Wallet context: injected-provider connection (MetaMask / Rainbow /
 * Zerion) + SIWE-style backend session.
 *
 * Non-custodial by design — the only thing stored client-side is the
 * short-lived backend JWT (sessionStorage, cleared on disconnect).
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";

import { api } from "@/lib/api";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (...a: never[]) => void): void;
  removeListener?(event: string, cb: (...a: never[]) => void): void;
}

interface WalletState {
  address: `0x${string}` | null;
  token: string | null;          // backend session (null until signed in)
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  signIn: () => Promise<string | null>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

function provider(): Eip1193 | null {
  return ((globalThis as { ethereum?: Eip1193 }).ethereum ?? null);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session + react to account switches.
  useEffect(() => {
    const stored = sessionStorage.getItem("rs.session");
    if (stored) {
      try {
        const { address: a, token: t } = JSON.parse(stored);
        setAddress(a);
        setToken(t);
      } catch { /* corrupted session — ignore */ }
    }
    const eth = provider();
    const onAccounts = (accounts: string[]) => {
      if (!accounts.length) {
        setAddress(null); setToken(null);
        sessionStorage.removeItem("rs.session");
      } else if (accounts[0].toLowerCase() !== address?.toLowerCase()) {
        setAddress(accounts[0] as `0x${string}`);
        setToken(null); // new identity — must sign in again
        sessionStorage.removeItem("rs.session");
      }
    };
    eth?.on?.("accountsChanged", onAccounts as never);
    return () => eth?.removeListener?.("accountsChanged", onAccounts as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const eth = provider();
    if (!eth) {
      setError("No wallet found. Install MetaMask, Rainbow, or Zerion.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts.length) setAddress(accounts[0] as `0x${string}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection rejected");
    } finally {
      setConnecting(false);
    }
  }, []);

  const signIn = useCallback(async (): Promise<string | null> => {
    if (!address) return null;
    if (token) return token;
    const eth = provider();
    if (!eth) return null;
    setError(null);
    try {
      const { message } = await api.nonce(address);
      const signature = (await eth.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;
      const res = await api.verify(address.toLowerCase(), signature);
      setToken(res.token);
      sessionStorage.setItem("rs.session",
        JSON.stringify({ address, token: res.token }));
      return res.token;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      return null;
    }
  }, [address, token]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setToken(null);
    sessionStorage.removeItem("rs.session");
  }, []);

  const value = useMemo(
    () => ({ address, token, connecting, error, connect, signIn, disconnect }),
    [address, token, connecting, error, connect, signIn, disconnect],
  );
  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}
