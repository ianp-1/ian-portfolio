"use client"

import React from "react"
import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { useLenis } from "lenis/react"

export function Navbar() {
    const lenis = useLenis()

    const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        if (href.startsWith("#")) {
            e.preventDefault()
            lenis?.scrollTo(href)
        }
    }

    return (
        <header className="absolute top-0 w-full p-6 flex justify-between items-center z-50 max-w-6xl left-1/2 -translate-x-1/2">
            <div className="font-bold text-xl tracking-tighter">IP</div>
            <nav className="flex items-center gap-4">
                <Link
                    href="#projects"
                    onClick={(e) => handleScroll(e, "#projects")}
                    className="text-sm font-medium hover:text-primary transition-colors"
                >
                    Projects
                </Link>
                <Link
                    href="#experience"
                    onClick={(e) => handleScroll(e, "#experience")}
                    className="text-sm font-medium hover:text-primary transition-colors"
                >
                    Experience
                </Link>
                <Link
                    href="#contact"
                    onClick={(e) => handleScroll(e, "#contact")}
                    className="text-sm font-medium hover:text-primary transition-colors"
                >
                    Contact
                </Link>
                <ModeToggle />
            </nav>
        </header>
    )
}
