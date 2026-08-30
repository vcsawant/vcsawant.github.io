import { defineCollection, reference, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

const skills = defineCollection({
  loader: file('src/data/skills.json'),
  schema: z.object({
    id: z.string(),
    label: z.string(),
    category: z.enum(['language', 'framework', 'platform', 'practice']),
    weight: z.number().min(1).max(5).default(3),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().max(280),
    role: z.string(),
    stack: z.array(reference('skills')).min(1),
    links: z.object({ live: z.url().optional(), repo: z.url().optional() }).default({}),
    featured: z.boolean().default(false),
    order: z.number().int().default(99),
    placeholder: z.boolean().default(true),
  }),
});

export const collections = { skills, projects };
