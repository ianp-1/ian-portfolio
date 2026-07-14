import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    description: z.string(),
    tags: z.array(z.string()),
    award: z.string().optional(),
    code: z.string().url().optional(),
    demo: z.string().url().optional(),
  }),
});

const experience = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/experience" }),
  schema: z.object({
    company: z.string(),
    role: z.string(),
    period: z.string(),
    order: z.number(),
    highlights: z.array(z.string()),
  }),
});

export const collections = { projects, experience };
