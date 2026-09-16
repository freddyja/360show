"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Aperture, CalendarDays, Images, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

export function BottomNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/e/${eventId}`, label: "Event", icon: CalendarDays, match: "event" },
    { href: `/e/${eventId}/capture`, label: "Capture", icon: Aperture, match: "capture" },
    { href: `/e/${eventId}/gallery`, label: "Gallery", icon: Images, match: "gallery" },
    { href: `/e/${eventId}/settings`, label: "Settings", icon: Settings, match: "settings" },
  ];

  return (
    <nav className="grid grid-cols-4 border-t border-white/10 bg-black/20 backdrop-blur-md">
      {items.map((item) => {
        const active =
          item.match === "event"
            ? pathname === `/e/${eventId}`
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "relative flex min-h-[72px] flex-col items-center justify-center gap-1 text-sm transition",
              active ? "text-blue-400" : "text-slate-500 hover:text-slate-300",
            )}
          >
            {active && (
              <span className="absolute top-0 h-[3px] w-16 rounded-b bg-blue-500" />
            )}
            <Icon className="h-6 w-6" strokeWidth={1.75} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
