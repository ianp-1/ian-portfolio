import { Github, Linkedin, Mail, FileText } from "lucide-react";

export const LINKS = {
    github: "https://github.com/ianp-1",
    linkedin: "https://linkedin.com/in/pang-ian",
    email: "mailto:ipang@purdue.edu",
    resume: "/IanPang_Resume.pdf",
};

export const HERO = {
    title: "Ian Pang",
    role: "CS @ Purdue",
    description: "Computer Science student with a passion for building scalable systems, AI/ML applications, and intuitive user experiences.",
};

export const EXPERIENCE = [
    {
        company: "American Family Insurance",
        role: "Software Engineer Intern",
        period: "Incoming Summer 2026",
        description: [
            "Coming soon..."
        ],
    },
    {
        company: "FedEx - The Data Mine at Purdue",
        role: "Undergraduate Data Science Researcher",
        period: "Aug 2025 - Present",
        description: [
            "Developed a Python-based simulation engine to model and optimize routing logic for 180,000+ daily packages.",
            "Implemented data pipelines to aggregate and clean 200,000+ raw records for warehouse capacity stress-testing.",
        ],
    },
    {
        company: "Zhan Lab, Purdue University",
        role: "Research Assistant",
        period: "May 2025 - Present",
        description: [
            "Engineered real-time embryo detection pipeline using OpenCV/PyTorch (120 FPS, 20ms latency).",
            "Trained ResNet-based CNN for embryo classification with 80% accuracy.",
        ],
    },
    {
        company: "Suga International Holdings Limited",
        role: "Software Engineer Intern",
        period: "June 2025 - Aug 2025",
        description: [
            "Designed dual-core MicroPython architecture for audio mixer, reducing latency from 120ms to 13ms.",
            "Implemented automated CI/CD pipelines via GitHub Actions.",
            "Optimized DSP features in C, reducing CPU utilization by 40%.",
        ],
    },
    {
        company: "Suga International Holdings Limited",
        role: "Software Engineer Intern",
        period: "June 2024 - Aug 2024",
        description: [
            "Deployed real-time pet detection/navigation models on NVIDIA Jetson using YOLO (99%+ accuracy).",
            "Scaled image preprocessing pipeline for 80K+ images, doubling throughput.",
        ],
    },
];

export const PROJECTS = [
    {
        title: "Canopy",
        description: "Decentralized parametric insurance protocol on XRPL. Automates payouts using real-time weather data.",
        tags: ["Next.js", "XRPL", "Python", "LangGraph"],
        links: {
            code: "https://github.com/ianp-1/Canopy",
            demo: null,
        },
        award: "🥈 2nd Place Ripple Prize (TartanHacks 2026)",
    },
    {
        title: "Obscurafy",
        description: "Privacy-first iOS app scanning photo libraries for sensitive data using on-device ML.",
        tags: ["SwiftUI", "CoreML", "YOLO", "Vision"],
        links: {
            code: "https://github.com/AlexanderMcGreevy/Obscurafy",
            demo: null,
        },
        award: "🏆 1st Place Cybersecurity (HackUMass 2026)",
    },
];

export const SKILLS = [
    { name: "Python", icon: "python" },
    { name: "Java", icon: "java" },
    { name: "C/C++", icon: "cplusplus" },
    { name: "TypeScript", icon: "typescript" },
    { name: "React", icon: "react" },
    { name: "Node.js", icon: "nodejs" },
    { name: "Flask", icon: "flask" },
    { name: "FastAPI", icon: "fastapi" },
    { name: "PyTorch", icon: "pytorch" },
    { name: "Docker", icon: "docker" },
    { name: "Git", icon: "git" },
    { name: "GCP", icon: "googlecloud" },
    { name: "PostgreSQL", icon: "postgresql" },
];
