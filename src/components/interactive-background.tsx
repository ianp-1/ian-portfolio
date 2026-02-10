"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

export function InteractiveBackground() {
    const interactRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        if (!interactRef.current) return

        const xTo = gsap.quickTo(interactRef.current, "x", { duration: 0.6, ease: "power3.out" })
        const yTo = gsap.quickTo(interactRef.current, "y", { duration: 0.6, ease: "power3.out" })

        const handleMouseMove = (e: MouseEvent) => {
            const { clientX, clientY } = e
            xTo(clientX)
            yTo(clientY)
        }

        window.addEventListener("mousemove", handleMouseMove)

        return () => {
            window.removeEventListener("mousemove", handleMouseMove)
        }
    }, [])

    return (
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
            <div
                ref={interactRef}
                className="absolute top-0 left-0 w-[600px] h-[600px] -translate-x-1/2 -translate-y-1/2 bg-primary/30 rounded-full blur-[120px] opacity-70 mix-blend-plus-lighter dark:mix-blend-screen"
            />
        </div>
    )
}
