import type { ReactNode } from "react";
import { requireAccount } from "@/server/account";

export default async function SetupLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAccount();
  return children;
}
