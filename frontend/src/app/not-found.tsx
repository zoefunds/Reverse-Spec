import { Button, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="404 — wrong problem"
      hint="This page doesn't exist. Maybe the spec was asking the wrong question."
      action={<Button href="/explorer">Back to Explorer</Button>}
    />
  );
}
