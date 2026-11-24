export const SITE = {
  name: "Ian Pang",
  role: "Software Engineer",
  tagline:
    "Computer science at Purdue. Building distributed systems, applied ML, and fast interfaces.",
  location: "Boston, MA",
  email: "ipang@purdue.edu",
};

export const LINKS = {
  github: "https://github.com/ianp-1",
  linkedin: "https://linkedin.com/in/pang-ian",
  email: "mailto:ipang@purdue.edu",
  resume: "/IanPang_Resume.pdf",
};

// Grouped so the skills section reads as a considered inventory, not a logo dump.
export const SKILLS: { group: string; items: string[] }[] = [
  {
    group: "Languages",
    items: ["Python", "C / C++", "TypeScript", "Java", "SwiftUI"],
  },
  {
    group: "ML and systems",
    items: ["PyTorch", "OpenCV", "CoreML", "YOLO", "LangGraph"],
  },
  {
    group: "Backend and infra",
    items: ["Node.js", "FastAPI", "Flask", "PostgreSQL", "Docker", "GCP"],
  },
];
