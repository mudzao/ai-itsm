"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, FileSpreadsheet } from "lucide-react";

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-background border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold">
              L1 Helpdesk
            </Link>
          </div>
          <div className="flex space-x-4">
            <Link
              href="/"
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                pathname === "/"
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </Link>
            <Link
              href="/ticket-import"
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                pathname === "/ticket-import"
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Ticket Import
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
} 