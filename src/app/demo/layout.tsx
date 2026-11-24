import { Suspense } from "react";
import { DemoShell } from "@/components/demo-shell";
import { Splash } from "@/components/brand";

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<Splash />}>
      <DemoShell>{children}</DemoShell>
    </Suspense>
  );
}
