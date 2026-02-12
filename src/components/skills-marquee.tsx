"use client"

import { useRef } from "react"
import { Terminal } from "lucide-react"
import { SKILLS } from "@/lib/data"
import { Icons } from "@/components/icons"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

export function SkillsMarquee() {
    const containerRef = useRef<HTMLDivElement>(null)
    const marqueeRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        if (marqueeRef.current) {
            const content = marqueeRef.current.querySelector('.marquee-content') as HTMLElement;
            if (content) {
                const contentWidth = content.scrollWidth;

                gsap.to(marqueeRef.current, {
                    x: -contentWidth,
                    duration: 30,
                    ease: "none",
                    repeat: -1,
                });
            }
        }
    }, { scope: containerRef })

    return (
        <section className="py-12 border-muted/20 overflow-hidden relative">
            <div className="max-w-6xl mx-auto px-6 mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Technologies I work with</h2>
            </div>
            <div className="relative w-full overflow-hidden" ref={containerRef}>
                {/* Wrapper for GSAP */}
                <div ref={marqueeRef} className="flex w-fit">
                    <div className="marquee-content flex items-center gap-12 px-6 shrink-0">
                        {SKILLS.map((skill, index) => {
                            const Icon = Icons[skill.icon as keyof typeof Icons] || Terminal;
                            return (
                                <div key={`first-${skill.name}`} className="flex items-center gap-3 text-muted-foreground cursor-default">
                                    <Icon className="h-6 w-6" />
                                    <span className="font-medium text-lg">{skill.name}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="marquee-content flex items-center gap-12 px-6 shrink-0">
                        {SKILLS.map((skill, index) => {
                            const Icon = Icons[skill.icon as keyof typeof Icons] || Terminal;
                            return (
                                <div key={`second-${skill.name}`} className="flex items-center gap-3 text-muted-foreground cursor-default">
                                    <Icon className="h-6 w-6" />
                                    <span className="font-medium text-lg">{skill.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    )
}
