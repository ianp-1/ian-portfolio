import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Github, ExternalLink } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { PROJECTS } from "@/lib/data"

export default function Projects() {
    return (
        <div className="min-h-screen p-6 max-w-6xl mx-auto pt-24 relative bg-background text-foreground transition-colors duration-300">
            {/* Background Elements */}
            <div className="absolute inset-0 bg-grid-small-black/[0.2] dark:bg-grid-small-white/[0.2] -z-10 fixed" />
            <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] opacity-30 -z-10 mix-blend-multiply dark:mix-blend-screen animate-blob" />

            <header className="absolute top-0 w-full p-6 flex justify-between items-center z-50 max-w-6xl left-1/2 -translate-x-1/2">
                <div className="font-bold text-xl tracking-tighter">IP</div>
                <nav className="flex items-center gap-4">
                    <Link href="/" className="text-sm font-medium hover:text-primary transition-colors">Home</Link>
                    <ModeToggle />
                </nav>
            </header>

            <div className="mb-12 relative pt-10">
                <Button variant="ghost" asChild className="mb-6 pl-0 hover:bg-transparent hover:text-primary group">
                    <Link href="/"><ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to Home</Link>
                </Button>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600 dark:from-primary dark:to-blue-400">Featured Work</h1>
                <p className="text-muted-foreground text-lg max-w-2xl">A selection of projects I've built, ranging from low-level distributed systems to high-performance analytics dashboards.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {PROJECTS.map((project, index) => (
                    <Card key={index} className="flex flex-col border-muted/50 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 bg-card/40 backdrop-blur-md group h-full">
                        <div className="h-2 bg-gradient-to-r from-primary/50 via-primary to-blue-500/50 w-full" />
                        <CardHeader>
                            <div className="flex justify-between items-start gap-2">
                                <CardTitle className="group-hover:text-primary transition-colors truncate">{project.title}</CardTitle>
                                {project.award && <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 text-[10px] px-1 py-0 h-5 whitespace-nowrap">{project.award.split(' ')[0]}</Badge>}
                            </div>
                            <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 mt-2">
                            <div className="flex flex-wrap gap-2">
                                {project.tags.map(tag => (
                                    <Badge key={tag} variant="secondary" className="bg-secondary/50 hover:bg-secondary transition-colors">{tag}</Badge>
                                ))}
                            </div>
                        </CardContent>
                        <CardFooter className="pt-4 mt-auto border-t border-muted/20">
                            <Button variant="outline" size="sm" asChild className="w-full group hover:border-primary/50 hover:bg-primary/5">
                                <Link href={project.links.code || "#"} target="_blank">
                                    <Github className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" /> Source Code
                                </Link>
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
