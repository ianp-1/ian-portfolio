import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Download, Mail, Github, Linkedin, MapPin, Globe } from "lucide-react"

export default function Resume() {
    return (
        <div className="min-h-screen p-8 max-w-4xl mx-auto pt-16 print:p-0 print:max-w-none">
            <div className="flex justify-between items-center mb-8 print:hidden">
                <Button variant="ghost" asChild className="pl-0 hover:bg-transparent hover:text-primary">
                    <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Home</Link>
                </Button>
                <Button>
                    <Download className="mr-2 h-4 w-4" /> Download PDF
                </Button>
            </div>

            <div className="bg-background border rounded-xl p-12 shadow-sm print:border-0 print:shadow-none print:p-0">
                {/* Header */}
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight mb-2">Ian Pang</h1>
                        <p className="text-xl text-primary font-medium">Software Engineer</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center justify-end gap-2"><MapPin className="h-3 w-3" /> San Francisco, CA</div>
                        <div className="flex items-center justify-end gap-2"><Mail className="h-3 w-3" /> hello@ianpang.dev</div>
                        <div className="flex items-center justify-end gap-2"><Globe className="h-3 w-3" /> ianpang.dev</div>
                    </div>
                </div>

                <Separator className="mb-8" />

                {/* Education */}
                <section className="mb-8">
                    <h2 className="text-lg font-bold uppercase tracking-wider mb-4 text-primary">Education</h2>
                    <div className="flex justify-between mb-2">
                        <div>
                            <h3 className="font-bold">University of California</h3>
                            <div className="text-muted-foreground">B.S. Computer Science</div>
                        </div>
                        <div className="text-right">
                            <div className="font-medium">Berkeley, CA</div>
                            <div className="text-sm text-muted-foreground">Expected 2026</div>
                        </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Coursework:</span> Algorithms, Data Structures, Operating Systems, Distributed Systems, Database Systems, Computer Architecture.
                    </div>
                </section>

                {/* Experience */}
                <section className="mb-8">
                    <h2 className="text-lg font-bold uppercase tracking-wider mb-4 text-primary">Experience</h2>

                    <div className="mb-6">
                        <div className="flex justify-between mb-2">
                            <div>
                                <h3 className="font-bold">Software Engineering Intern</h3>
                                <div className="text-muted-foreground">TechCorp Inc.</div>
                            </div>
                            <div className="text-right">
                                <div className="font-medium">San Francisco, CA</div>
                                <div className="text-sm text-muted-foreground">June 2024 - Present</div>
                            </div>
                        </div>
                        <ul className="list-disc list-outside ml-4 text-sm text-muted-foreground space-y-1">
                            <li>Optimized high-traffic API endpoints reducing latency by 40% using Redis caching.</li>
                            <li>Designed and implemented a real-time notification system using WebSockets.</li>
                            <li>Collaborated with product teams to refine requirements for new features.</li>
                        </ul>
                    </div>

                    <div>
                        <div className="flex justify-between mb-2">
                            <div>
                                <h3 className="font-bold">Research Assistant</h3>
                                <div className="text-muted-foreground">Distributed Systems Lab</div>
                            </div>
                            <div className="text-right">
                                <div className="font-medium">Berkeley, CA</div>
                                <div className="text-sm text-muted-foreground">Jan 2024 - May 2024</div>
                            </div>
                        </div>
                        <ul className="list-disc list-outside ml-4 text-sm text-muted-foreground space-y-1">
                            <li>Built a simulation framework in Go to test Raft consensus under network partitions.</li>
                            <li>Published findings on eventual consistency models in edge computing environments.</li>
                        </ul>
                    </div>
                </section>

                {/* Projects */}
                <section className="mb-8">
                    <h2 className="text-lg font-bold uppercase tracking-wider mb-4 text-primary">Projects</h2>

                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between">
                                <h3 className="font-bold">Nexus Analytics <span className="text-muted-foreground font-normal text-sm ml-2">Next.js, Postgres, Tremor</span></h3>
                            </div>
                            <p className="text-sm text-muted-foreground">SaaS dashboard for real-time user metrics visualization. Handled 10k+ events/day.</p>
                        </div>
                        <div>
                            <div className="flex justify-between">
                                <h3 className="font-bold">Synthetix AI <span className="text-muted-foreground font-normal text-sm ml-2">Python, FastAPI, OpenAI</span></h3>
                            </div>
                            <p className="text-sm text-muted-foreground">NLP engine for tracking and generating semantic documentation from codebases.</p>
                        </div>
                        <div>
                            <div className="flex justify-between">
                                <h3 className="font-bold">Ray Tracer <span className="text-muted-foreground font-normal text-sm ml-2">C++, OpenGL</span></h3>
                            </div>
                            <p className="text-sm text-muted-foreground">Photorealistic rendering engine supporting reflections, shadows, and multi-threading.</p>
                        </div>
                    </div>
                </section>

                {/* Skills */}
                <section>
                    <h2 className="text-lg font-bold uppercase tracking-wider mb-4 text-primary">Skills</h2>
                    <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="font-medium">Languages</span>
                            <span className="text-muted-foreground">C++, Python, TypeScript, Go, Rust, SQL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-medium">Frontend</span>
                            <span className="text-muted-foreground">React, Next.js, TailwindCSS</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-medium">Backend</span>
                            <span className="text-muted-foreground">Node.js, FastAPI, PostgreSQL, Redis</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-medium">DevOps</span>
                            <span className="text-muted-foreground">Docker, AWS, Git, CI/CD</span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
