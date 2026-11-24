"use client";

import {
  Database,
  LayoutGrid,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Target,
  type LucideProps,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { demoAsOf, demoBusiness } from "@/demo/fixture";
import { periodParams, readPeriod } from "@/domain/sales";
import { Wordmark } from "./brand";

function ChatIcon(props: LucideProps) {
  return (
    <MessageCircle {...props}>
      <path d="M8 9h8M8 13h5" />
    </MessageCircle>
  );
}

const nav = [
  { label: "Dashboard", mobile: "Dashboard", href: "/demo", icon: LayoutGrid },
  {
    label: "Target bisnis",
    mobile: "Target",
    href: "/demo/target-bisnis",
    icon: Target,
  },
  {
    label: "Asisten",
    mobile: "Asisten",
    href: "/demo/asisten",
    icon: ChatIcon,
  },
  {
    label: "Sumber data",
    mobile: "Sumber data",
    href: "/demo/sumber-data",
    icon: Database,
  },
];

export function DemoShell({
  children,
  businessName,
  accountMenu,
}: {
  children: ReactNode;
  businessName?: string;
  accountMenu?: ReactNode;
}) {
  const [compact, setCompact] = useState(false);
  const SidebarIcon = compact ? PanelLeftOpen : PanelLeftClose;
  const pathname = usePathname();
  const params = useSearchParams();
  const businessQuery = new URLSearchParams();
  for (const key of ["tampilan", "periode"]) {
    const value = params.get(key);
    if (value && value.length <= 10) businessQuery.set(key, value);
  }
  const query = periodParams(
    readPeriod(
      {
        tampilan: params.get("tampilan") ?? undefined,
        periode: params.get("periode") ?? undefined,
      },
      demoAsOf,
    ),
  );

  return (
    <div
      className={
        (compact ? "demo-shell compact" : "demo-shell") +
        (pathname === "/demo" || pathname === "/dashboard"
          ? " dashboard-shell"
          : "") +
        (pathname.includes("/target-bisnis") ? " target-shell" : "") +
        ((pathname === "/demo/asisten" || pathname === "/asisten") &&
        !params.get("tanya")
          ? " assistant-shell"
          : "")
      }
    >
      <a className="skip-link" href="#konten">
        Ke konten utama
      </a>
      <header className="sidebar">
        <div className="sidebar-top">
          <Wordmark />
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={compact ? "Perluas navigasi" : "Ringkas navigasi"}
            aria-expanded={!compact}
            aria-controls="demo-navigation"
            onClick={() => setCompact(!compact)}
          >
            <SidebarIcon size={22} aria-hidden="true" focusable="false" />
          </button>
        </div>
        <div className="sidebar-business">
          <strong>{businessName ?? demoBusiness}</strong>
          <span>{businessName ? "Usaha Anda" : "Data contoh"}</span>
        </div>
        <nav
          id="demo-navigation"
          className="nav"
          aria-label={businessName ? "Navigasi usaha" : "Navigasi demo"}
        >
          {nav.map(({ label, mobile, href: itemHref, icon: Icon }) => {
            const href = businessName
              ? itemHref === "/demo"
                ? "/dashboard"
                : itemHref.slice(5)
              : itemHref;
            const active =
              pathname === href ||
              (href === "/demo" &&
                (pathname === "/demo/harian" || pathname === "/demo/produk")) ||
              (href === "/demo/target-bisnis" &&
                pathname.startsWith(href + "/")) ||
              (businessName && pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={
                  businessName
                    ? businessQuery.size
                      ? `${href}?${businessQuery}`
                      : href
                    : `${href}?${query}`
                }
                aria-current={active ? "location" : undefined}
                aria-label={label}
                title={compact ? label : undefined}
              >
                <Icon
                  className="nav-icon"
                  size={22}
                  aria-hidden="true"
                  focusable="false"
                />
                <span className="nav-label">{label}</span>
                <span className="nav-mobile-label">{mobile}</span>
              </Link>
            );
          })}
        </nav>
        {accountMenu}
      </header>
      <main className="dashboard-content" id="konten">
        {children}
      </main>
    </div>
  );
}
