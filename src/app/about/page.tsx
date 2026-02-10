import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Mail, MapPin, Briefcase, GraduationCap } from "lucide-react"

export default function About() {
    return (
        <div className="min-h-screen p-6 max-w-5xl mx-auto pt-16">
            <Button variant="ghost" asChild className="mb-8 pl-0 hover:bg-transparent hover:text-primary">
                <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Home</Link>
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
                {/* Left Column: Profile */}
                <div className="md:col-span-4 flex flex-col gap-6">
                    <div className="aspect-square rounded-2xl bg-muted overflow-hidden relative">
                        {/* Placeholder for Profile Image */}
                        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-secondary">
                            <span className="text-6xl font-bold opacity-20">IP</span>
                        </div>
                    </div>

                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">Ian Pang</h1>
                        <p className="text-lg text-primary font-medium mb-4">Software Engineer</p>
                        <div className="flex flex-col gap-2 text-muted-foreground text-sm">
                            <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" /> San Francisco, CA
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4" /> hello@ianpang.dev
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <GraduationCap className="h-4 w-4" /> Education
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <div className="font-medium">University of California</div>
                                <div className="text-sm text-muted-foreground">B.S. Computer Science</div>
                                <div className="text-xs text-muted-foreground mt-1">Expected 2026</div>
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Coursework</div>
                                <div className="flex flex-wrap gap-1">
                                    {["Algorithms", "Distributed Systems", "OS", "Compilers", "AI/ML"].map(c => (
                                        <span key={c} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">{c}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Content */}
                <div className="md:col-span-8 flex flex-col gap-12">

                    {/* Bio */}
                    <section>
                        <h2 className="text-2xl font-bold tracking-tight mb-4">About Me</h2>
                        <div className="prose dark:prose-invert text-muted-foreground leading-relaxed">
                            <p className="mb-4">
                                I am a Junior Computer Science student with a passion for building scalable, high-performance software.
                                My journey began with a curiosity about how the internet works, which led me down the rabbit hole of
                                distributed systems and compiler design.
                            </p>
                            <p>
                                When I'm not coding, I'm likely reading about system architecture, experimenting with new
                                frontend frameworks, or hiking the trails around the Bay Area.
                            </p>
                        </div>
                    </section>

                    {/* Experience */}
                    <section>
                        <h2 className="text-2xl font-bold tracking-tight mb-6 flex items-center gap-2">
                            <Briefcase className="h-5 w-5" /> Experience
                        </h2>
                        <div className="space-y-8 border-l-2 border-muted pl-6 relative">
                            {/* Role 1 */}
                            <div className="relative">
                                <span className="absolute -left-[31px] top-1.5 h-4 w-4 rounded-full border-4 border-background bg-primary" />
                                <h3 className="font-bold text-lg">Software Engineering Intern</h3>
                                <div className="text-primary font-medium mb-1">TechCorp Inc.</div>
                                <div className="text-sm text-muted-foreground mb-4">June 2024 - Present</div>
                                <ul className="list-disc list-outside ml-4 text-muted-foreground space-y-1 text-sm">
                                    <li>Optimized database queries reducing latency by 40% for the main dashboard.</li>
                                    <li>Implemented a new authentication flow using OAuth 2.0 and JWT.</li>
                                    <li>Collaborated with senior engineers to migrate legacy code to React.</li>
                                </ul>
                            </div>
                            {/* Role 2 */}
                            <div className="relative">
                                <span className="absolute -left-[31px] top-1.5 h-4 w-4 rounded-full border-4 border-background bg-muted-foreground" />
                                <h3 className="font-bold text-lg">Research Assistant</h3>
                                <div className="text-primary font-medium mb-1">Distributed Systems Lab</div>
                                <div className="text-sm text-muted-foreground mb-4">Jan 2024 - May 2024</div>
                                <ul className="list-disc list-outside ml-4 text-muted-foreground space-y-1 text-sm">
                                    <li>Conducted experiments on consensus algorithms in high-latency networks.</li>
                                    <li>Developed a simulation tool in Go to visualize network partitions.</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Skills */}
                    <section>
                        <h2 className="text-2xl font-bold tracking-tight mb-6">Technical Skills</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardContent className="pt-6">
                                    <h3 className="font-semibold mb-3">Languages</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {["Python", "TypeScript", "Go", "C++", "Rust", "SQL"].map(s => (
                                            <Badge key={s} variant="secondary">{s}</Badge>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <h3 className="font-semibold mb-3">Frameworks & Tools</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {["React", "Next.js", "Node.js", "Docker", "Git", "AWS", "Postgres"].map(s => (
                                            <Badge key={s} variant="secondary">{s}</Badge>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </section>

                    {/* Philosophy */}
                    <section className="bg-muted/30 p-8 rounded-xl border border-muted/50">
                        <h2 className="text-lg font-bold mb-2">Engineering Philosophy</h2>
                        <blockquote className="text-muted-foreground italic border-l-4 border-primary pl-4 py-1">
                            "Simplicity is prerequisite for reliability." — Edsger W. Dijkstra
                        </blockquote>
                    </section>

                </div>
            </div>
        </div>
    )
}
