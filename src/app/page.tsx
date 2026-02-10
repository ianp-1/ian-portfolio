import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Github, Mail, Linkedin, Briefcase } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { EXPERIENCE, PROJECTS, LINKS } from "@/lib/data"
import { HeroSection } from "@/components/hero-section"
import { SkillsMarquee } from "@/components/skills-marquee"
import { ScrollAnimations } from "@/components/scroll-animations"
import { InteractiveBackground } from "@/components/interactive-background"

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden text-foreground transition-colors duration-300">
      <ScrollAnimations />
      <InteractiveBackground />

      {/* Navigation / Header */}
      <Navbar />

      {/* Background Elements - Stronger Gradients */}
      <div className="absolute inset-0 w-full h-full bg-background -z-20" />
      <div className="absolute inset-0 w-full h-full bg-grid-black dark:bg-grid-white -z-10" />
      {/* Radial fade for grid */}
      <div className="absolute pointer-events-none inset-0 flex items-center justify-center bg-background [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] -z-10" />

      {/* Richer Colored Blobs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/25 rounded-full blur-[120px] opacity-40 -z-10 animate-blob mix-blend-multiply dark:mix-blend-screen" />
      <div className="absolute top-[30%] right-[0%] w-[600px] h-[500px] bg-purple-500/25 rounded-full blur-[120px] opacity-30 -z-10 animate-blob animation-delay-2000 mix-blend-multiply dark:mix-blend-screen" />
      <div className="absolute bottom-[20%] left-[0%] w-[600px] h-[500px] bg-blue-500/25 rounded-full blur-[120px] opacity-30 -z-10 animate-blob animation-delay-4000 mix-blend-multiply dark:mix-blend-screen" />

      {/* Hero Section */}
      <HeroSection />

      {/* Tech Stack Marquee (GSAP) */}
      <SkillsMarquee />

      {/* Experience Section */}
      <section id="experience" className="py-24 px-6 max-w-6xl mx-auto w-full relative">
        <div className="flex flex-col mb-16 reveal-up">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Experience</h2>
          <p className="text-muted-foreground text-lg">My professional journey.</p>
        </div>

        <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-primary/20 before:to-transparent">

          {EXPERIENCE.map((job, index) => (
            <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group reveal-up">
              {/* Timeline Dot */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-primary/20 bg-background shadow-lg shadow-primary/5 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 group-hover:border-primary transition-colors duration-300">
                <Briefcase className="w-5 h-5 text-primary" />
              </div>

              {/* Content Card */}
              <Card className="ml-4 md:ml-0 w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] p-4 md:p-6 bg-card/40 backdrop-blur-md hover:bg-card/60 transition-all duration-300 border-muted/50 hover:border-primary/20 group-hover:shadow-lg group-hover:shadow-primary/5">
                <CardHeader className="p-0 mb-4">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2">
                    <div>
                      <CardTitle className="text-lg md:text-xl font-bold">{job.role}</CardTitle>
                      <CardDescription className="text-primary font-medium text-base mt-1">{job.company}</CardDescription>
                    </div>
                    <Badge variant="outline" className="w-fit whitespace-nowrap bg-secondary/50 text-xs md:text-sm">{job.period}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 text-sm text-muted-foreground">
                  <ul className="text-left list-disc list-outside ml-4 space-y-2 marker:text-primary/50">
                    {job.description.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          ))}

        </div>
      </section>

      {/* Featured Projects Preview */}
      <section id="projects" className="py-24 px-6 max-w-6xl mx-auto w-full relative border-t border-muted/20">
        <div className="flex justify-between items-end mb-12 reveal-up">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Featured Projects</h2>
            <p className="text-muted-foreground text-lg">A selection of my recent work.</p>
          </div>
          <Button variant="ghost" asChild className="hidden md:flex group hover:bg-primary/10">
            <Link href="/projects">View All Projects <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {PROJECTS.map((project, index) => (
            <div key={index} className="reveal-up h-full">
              <Card className="flex flex-col h-full border-muted/50 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 bg-card/40 backdrop-blur-md overflow-hidden group">
                <div className="h-2 bg-gradient-to-r from-primary/50 via-primary to-blue-500/50 w-full" />
                <CardHeader>
                  <div className="flex justify-between items-start gap-4">
                    <CardTitle className="text-2xl group-hover:text-primary transition-colors">{project.title}</CardTitle>
                    {project.award && <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 whitespace-nowrap">{project.award}</Badge>}
                  </div>
                  <CardDescription className="text-base">{project.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 mt-4">
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="bg-secondary/50 hover:bg-secondary transition-colors">{tag}</Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="pt-6 border-t border-muted/20">
                  <Button variant="outline" size="sm" asChild className="w-full group hover:border-primary/50 hover:bg-primary/5">
                    <Link href={project.links.code || "#"} target="_blank">
                      View Source <Github className="ml-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center md:hidden">
          <Button variant="outline" size="lg" asChild className="w-full">
            <Link href="/projects">View All Projects</Link>
          </Button>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="reveal-up py-32 px-6 max-w-4xl mx-auto w-full text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent -z-10 blur-3xl opacity-50" />
        <h2 className="text-4xl font-bold mb-6">Get In Touch</h2>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          Currently looking for new opportunities. Whether you have a question or just want to say hi, I'll try my best to get back to you!
        </p>
        <Button size="lg" className="h-12 px-8 text-lg shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-shadow" asChild>
          <Link href={LINKS.email}>
            Say Hello <Mail className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      </section>

      <footer className="relative py-12 px-6 text-center text-sm text-muted-foreground border-t border-muted/20 bg-background overflow-hidden">
        {/* Footer Background Effect */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent -z-10" />
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-center gap-6 mb-8">
            <Link href={LINKS.github} target="_blank" className="p-2 hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-300"><Github className="h-5 w-5" /></Link>
            <Link href={LINKS.linkedin} target="_blank" className="p-2 hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-300"><Linkedin className="h-5 w-5" /></Link>
            <Link href={LINKS.email} className="p-2 hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-300"><Mail className="h-5 w-5" /></Link>
          </div>
          <p className="font-medium tracking-wide italic">Designed & Built by Ian Pang</p>
          <p className="mt-2 text-xs opacity-50">© {new Date().getFullYear()} Ian Pang. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
