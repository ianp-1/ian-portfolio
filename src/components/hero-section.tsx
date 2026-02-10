"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Github, Mail, Linkedin, Download } from "lucide-react"
import { HERO, LINKS } from "@/lib/data"
import React, { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { useLenis } from "lenis/react"

gsap.registerPlugin(useGSAP)

export function HeroSection() {
    const containerRef = useRef<HTMLElement>(null)
    const lenis = useLenis()

    useGSAP(() => {
        // Animate hero elements
        gsap.from(".hero-animate", {
            y: 50,
            opacity: 0,
            duration: 1,
            stagger: 0.2,
            ease: "power3.out"
        })
    }, { scope: containerRef })

    const handleScroll = (e: React.MouseEvent) => {
        e.preventDefault()
        lenis?.scrollTo("#projects")
    }

    return (
        <section ref={containerRef} className="flex-1 flex flex-col justify-center items-start px-6 max-w-6xl mx-auto w-full pt-40 pb-20 md:pt-32">
            <div className="space-y-4 max-w-3xl">
                <div className="hero-animate">
                    <Badge variant="outline" className="mb-4 backdrop-blur-sm border-primary/20 text-primary">
                        {HERO.role}
                    </Badge>
                </div>
                <h1 className="hero-animate text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-foreground via-primary to-foreground pb-2 leading-tight">
                    {HERO.title}
                </h1>
                <p className="hero-animate text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mb-8">
                    {HERO.description}
                </p>
                <div className="hero-animate flex flex-wrap gap-4">
                    <Button size="lg" className="group shadow-lg shadow-primary/20" onClick={handleScroll}>
                        View Work <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                    <Button size="lg" variant="outline" className="group hover:bg-primary/5" asChild>
                        <Link href={LINKS.resume} target="_blank">
                            View Resume <Download className="ml-2 h-4 w-4 group-hover:translate-y-1 transition-transform" />
                        </Link>
                    </Button>
                    <div className="flex items-center gap-2 ml-2 border-l pl-4 border-muted/50">
                        <Button size="icon" variant="ghost" className="hover:text-primary hover:bg-primary/10 rounded-full" asChild>
                            <Link href={LINKS.github} target="_blank"><Github className="h-5 w-5" /></Link>
                        </Button>
                        <Button size="icon" variant="ghost" className="hover:text-primary hover:bg-primary/10 rounded-full" asChild>
                            <Link href={LINKS.linkedin} target="_blank"><Linkedin className="h-5 w-5" /></Link>
                        </Button>
                        <Button size="icon" variant="ghost" className="hover:text-primary hover:bg-primary/10 rounded-full" asChild>
                            <Link href={LINKS.email}><Mail className="h-5 w-5" /></Link>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
