
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Github, ExternalLink, ArrowLeft } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { PROJECTS } from "@/lib/data"
import { InteractiveBackground } from "@/components/interactive-background"
import { ScrollAnimations } from "@/components/scroll-animations"

export default function Projects() {
    return (
        <div className="flex flex-col min-h-screen relative overflow-hidden text-foreground transition-colors duration-300">
            <ScrollAnimations />
            <InteractiveBackground />

            <Navbar />

            {/* Background Elements - Consistent with Home Page */}
            <div className="absolute inset-0 w-full h-full bg-background -z-20" />
            <div className="absolute inset-0 w-full h-full bg-grid-black dark:bg-grid-white -z-10" />
            <div className="absolute pointer-events-none inset-0 flex items-center justify-center bg-background [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] -z-10" />

            {/* Richer Colored Blobs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/25 rounded-full blur-[120px] opacity-40 -z-10 animate-blob mix-blend-multiply dark:mix-blend-screen" />
            <div className="absolute top-[30%] right-[0%] w-[600px] h-[500px] bg-purple-500/25 rounded-full blur-[120px] opacity-30 -z-10 animate-blob animation-delay-2000 mix-blend-multiply dark:mix-blend-screen" />
            <div className="absolute bottom-[20%] left-[0%] w-[600px] h-[500px] bg-blue-500/25 rounded-full blur-[120px] opacity-30 -z-10 animate-blob animation-delay-4000 mix-blend-multiply dark:mix-blend-screen" />

            <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-32">
                <div className="flex flex-col mb-16 reveal-up">
                    <Button variant="ghost" asChild className="w-fit mb-8 -ml-4 group hover:bg-white/5">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to Home
                        </Link>
                    </Button>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600 dark:from-primary dark:to-blue-400">My Projects</h1>
                    {/*<p className="text-muted-foreground text-lg max-w-2xl">Projects I've built, ranging from low-level distributed systems to high-performance analytics dashboards.</p>*/}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
                    {PROJECTS.map((project, index) => (
                        <div key={index} className="reveal-up h-full">
                            <Card className="flex flex-col h-full border-muted/50 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 bg-card/40 backdrop-blur-md overflow-hidden group">
                                <div className="h-2 bg-gradient-to-r from-primary/50 via-primary to-blue-500/50 w-full" />
                                <CardHeader>
                                    <div className="flex justify-between items-start gap-2">
                                        <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">{project.title}</CardTitle>
                                        {project.award && <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 text-[10px] px-2 py-0.5 h-auto whitespace-normal max-w-[120px] text-center">{project.award}</Badge>}
                                    </div>
                                    <CardDescription className="line-clamp-3 text-base mt-2">{project.description}</CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 mt-auto">
                                    <div className="flex flex-wrap gap-2">
                                        {project.tags.map(tag => (
                                            <Badge key={tag} variant="secondary" className="bg-secondary/50 hover:bg-secondary transition-colors">{tag}</Badge>
                                        ))}
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-6 border-t border-muted/20">
                                    <Button variant="outline" size="sm" asChild className="w-full group hover:border-primary/50 hover:bg-primary/5">
                                        <Link href={project.links.code || "#"} target="_blank">
                                            <Github className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" /> View Code
                                        </Link>
                                    </Button>
                                </CardFooter>
                            </Card>
                        </div>
                    ))}
                </div>
            </main>

            <Footer />
        </div>
    )
}
