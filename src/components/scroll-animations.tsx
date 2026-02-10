"use client"

import { useLayoutEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function ScrollAnimations() {
    useLayoutEffect(() => {
        const elements = document.querySelectorAll(".reveal-up")

        elements.forEach((el) => {
            gsap.fromTo(
                el,
                {
                    y: 40,
                    opacity: 0
                },
                {
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: el,
                        start: "top 92%", // Trigger just before it hits the view
                        toggleActions: "play none none reverse",
                    },
                }
            )
        })

        return () => {
            ScrollTrigger.getAll().forEach(t => t.kill())
        }
    }, [])

    return null
}
