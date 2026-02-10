"use client"

import React from "react"
import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { useLenis } from "lenis/react"
import { Menu, X } from "lucide-react"

export function Navbar() {
    const lenis = useLenis()
    const [isOpen, setIsOpen] = React.useState(false)

    const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        if (href.startsWith("#")) {
            e.preventDefault()
            lenis?.scrollTo(href)
            setIsOpen(false)
        }
    }

    return (
        <>
            <header className="fixed top-0 w-full p-4 md:p-6 flex justify-between items-center z-50 transition-all bg-background/80 backdrop-blur-md border-b border-muted/20">
                <div className="font-bold text-xl tracking-tighter">IP</div>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-6">
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

                {/* Mobile Controls */}
                <div className="flex items-center gap-4 md:hidden">
                    <ModeToggle />
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="p-2 text-foreground hover:bg-primary/10 rounded-md transition-colors"
                    >
                        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>
                </div>
            </header>

            {/* Mobile Nav Overlay */}
            <div className={`fixed inset-0 z-40 bg-background/95 backdrop-blur-xl md:hidden transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <nav className="flex flex-col items-center justify-center h-full gap-8 px-6">
                    <Link
                        href="#projects"
                        onClick={(e) => handleScroll(e, "#projects")}
                        className="text-2xl font-bold hover:text-primary transition-colors"
                    >
                        Projects
                    </Link>
                    <Link
                        href="#experience"
                        onClick={(e) => handleScroll(e, "#experience")}
                        className="text-2xl font-bold hover:text-primary transition-colors"
                    >
                        Experience
                    </Link>
                    <Link
                        href="#contact"
                        onClick={(e) => handleScroll(e, "#contact")}
                        className="text-2xl font-bold hover:text-primary transition-colors"
                    >
                        Contact
                    </Link>
                </nav>
            </div>
        </>
    )
}
