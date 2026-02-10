
import Link from "next/link"
import { Github, Linkedin, Mail } from "lucide-react"

const LINKS = {
    github: "https://github.com/ianp-1",
    linkedin: "https://linkedin.com/in/ianpang",
    email: "mailto:ian.pang@example.com" // Replace with actual email if known or keep placeholder
}

export function Footer() {
    return (
        <footer className="relative py-12 px-6 text-center text-sm text-muted-foreground border-t border-white/5 overflow-hidden">
            {/* Footer Background Effect - Transparent/Subtle */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent -z-10 backdrop-blur-[2px]" />
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-center gap-6 mb-8">
                    <Link href={LINKS.github} target="_blank" className="p-2 hover:text-primary hover:bg-white/5 rounded-full transition-all duration-300"><Github className="h-5 w-5" /></Link>
                    <Link href={LINKS.linkedin} target="_blank" className="p-2 hover:text-primary hover:bg-white/5 rounded-full transition-all duration-300"><Linkedin className="h-5 w-5" /></Link>
                    <Link href={LINKS.email} className="p-2 hover:text-primary hover:bg-white/5 rounded-full transition-all duration-300"><Mail className="h-5 w-5" /></Link>
                </div>
                <p className="font-medium tracking-wide italic opacity-80">Designed & Built by Ian Pang</p>
                <p className="mt-2 text-xs opacity-40">© {new Date().getFullYear()} Ian Pang. All rights reserved.</p>
            </div>
        </footer>
    )
}
