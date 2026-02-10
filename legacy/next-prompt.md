---
page: resume
---
A professional "Resume" page for the portfolio.

**Page Structure:**

1. **Header:** "Resume" title with a "Download PDF" button (primary style, use Download icon).
2. **resume Content:** A clean, paper-like layout (centered container, white bg on off-white page, or just clean sections).
    * **Contact Info:** Name, Email, Phone, LinkedIn, GitHub, Location.
    * **Education:** University, Degree, GPA, Dates.
    * **Experience:** Reverse chronological order. Role, Company, Dates, and 3-4 bullet points per role.
    * **Projects:** Key projects with brief descriptions used in the resume.
    * **Skills:** Technical skills list.
3. **Footer:** Consistent with the Home page.

**DESIGN SYSTEM (REQUIRED):**

# Design System: Ian Pang Portfolio

**Project ID:** projects/6175357688289613145

## 1. Visual Theme & Atmosphere

**"Precise, Minimalist, Technical."**
The design embodies the "Shadcn UI" aesthetic—unapologetically clean, relying on abundant whitespace, crisp high-contrast typography, and a restrained monochromatic palette to signal engineering precision. It feels "airy" yet "dense" with information where needed (like the tech stack). It is professional without being corporate; modern without being trendy.

## 2. Color Palette & Roles

* **Canvas White** (`#ffffff`): The primary background for the page, creating a clean slate.
* **Off-White Surface** (`#f4f4f5`): Used for subtle backgrounds on cards or secondary sections to create depth without headers.
* **Ink Black** (`#09090b`): The primary text color, providing maximum contrast and readability.
* **Muted Gray** (`#71717a`): Used for secondary text, descriptions, and less clear borders.
* **Electric Blue** (`#3b82f6`): The primary accent color. Used sparingly for primary buttons, active states, and key interactive elements to draw the eye.
* **Subtle Border** (`#e4e4e7`): Used for the delicate borders on cards and inputs, defining structure without visual weight.

## 3. Typography Rules

* **Family:** `Inter` (Sans-serif). A variable font optimized for screen readability.
* **Headers:** `font-bold` or `font-semibold`. Tight letter-spacing (`tracking-tight`) for a modern, compact feel. Large sizes (4xl-6xl) for the Hero.
* **Body:** `font-normal`. Readable size (base or lg) with relaxed line-height (`leading-relaxed`) for paragraphs.
* **Monospace:** (Optional) Used for code snippets or technical tags, likely `JetBrains Mono` or standard system mono.

## 4. Component Stylings

* **Buttons:**
  * **Primary:** Solid Electric Blue background, white text, `rounded-md` (Standard 5px radius). `hover:bg-blue-600`.
  * **Outline:** Transparent background, `border border-input` (Subtle Border), hover fills with very light gray.
* **Cards:** Clean white surface, `border border-border` (Subtle Border), `rounded-lg` or `rounded-xl`. minimal or no shadow by default, subtle `shadow-sm` on hover.
* **Badges/Tags:** `rounded-full` or `rounded-md`. Often `bg-secondary` (light gray) with darker text.
* **Icons:** `Lucide` style—thin stroke (2px), simple geometric shapes.

## 5. Layout Principles

* **Whitespace:** Generous padding (`py-24`, `gap-8`). Space is used to group related elements and separate distinct sections.
* **Grid:** Strict alignment. Cards are often in 2 or 3 column grids (`grid-cols-1 md:grid-cols-3`).
* **Responsiveness:** Mobile-first. Stacks vertically on small screens, expands to horizontal layouts on `md` and `lg`.
* **Container:** Content is centrally constrained (`max-w-6xl mx-auto`) to maintain readability on large screens.
