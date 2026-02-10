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
        if (window.location.pathname !== "/") return; // Allow normal navigation on other pages
        if (href.startsWith("#")) {
            e.preventDefault()
            lenis?.scrollTo(href)
            setIsOpen(false)
        }
    }

    return (
        <>
            <header className="fixed top-0 w-full p-4 md:p-6 flex justify-between items-center z-50 transition-all bg-background/20 backdrop-blur-md border-b border-white/5 [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
                <Link href="/" className="font-bold text-xl tracking-tighter hover:text-primary transition-colors">IP</Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-6">
                    <Link
                        href="/#projects"
                        onClick={(e) => handleScroll(e, "#projects")}
                        className="text-sm font-medium hover:text-primary transition-colors"
                    >
                        Projects
                    </Link>
                    <Link
                        href="/#experience"
                        onClick={(e) => handleScroll(e, "#experience")}
                        className="text-sm font-medium hover:text-primary transition-colors"
                    >
                        Experience
                    </Link>
                    <Link
                        href="/#contact"
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

            {/* Mobile Nav Dropdown */}
            <div className={`fixed top-[73px] left-0 right-0 z-40 bg-background/20 backdrop-blur-md border-b border-white/5 md:hidden transition-all duration-300 ease-in-out origin-top [mask-image:linear-gradient(to_bottom,black_90%,transparent)] ${isOpen ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'}`}>
                <nav className="flex flex-col p-4 gap-2">
                    <Link
                        href="/#projects"
                        onClick={(e) => handleScroll(e, "#projects")}
                        className="text-lg font-medium hover:text-primary transition-colors p-2 rounded-md hover:bg-white/5"
                    >
                        Projects
                    </Link>
                    <Link
                        href="/#experience"
                        onClick={(e) => handleScroll(e, "#experience")}
                        className="text-lg font-medium hover:text-primary transition-colors p-2 rounded-md hover:bg-white/5"
                    >
                        Experience
                    </Link>
                    <Link
                        href="/#contact"
                        onClick={(e) => handleScroll(e, "#contact")}
                        className="text-lg font-medium hover:text-primary transition-colors p-2 rounded-md hover:bg-white/5"
                    >
                        Contact
                    </Link>
                </nav>
            </div>
        </>
    )
}
