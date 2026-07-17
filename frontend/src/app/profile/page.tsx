"use client";

/** /profile — redirects to the connected wallet's public profile. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button, EmptyState } from "@/components/ui";
import { useWallet } from "@/lib/wallet";

export default function ProfileIndexPage() {
  const { address, connect } = useWallet();
  const router = useRouter();
  useEffect(() => {
    if (address) router.replace(`/profile/${address.toLowerCase()}`);
  }, [address, router]);
  return (
    <EmptyState
      title="Connect your wallet"
      hint="Your profile is keyed to your wallet address."
      action={<Button onClick={() => void connect()}>Connect Wallet</Button>}
    />
  );
}
