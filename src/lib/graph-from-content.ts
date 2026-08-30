/*
 * Bridge from astro:content collections to the pure graph model.
 * Server/build-time only — never import from client code.
 */
import { getCollection } from 'astro:content';
import { buildGraph, type GraphData } from './graph';

export async function graphFromContent(): Promise<GraphData> {
  const [skills, projects] = await Promise.all([
    getCollection('skills'),
    getCollection('projects'),
  ]);
  return buildGraph(
    skills.map((s) => ({
      id: s.data.id,
      label: s.data.label,
      category: s.data.category,
      weight: s.data.weight,
    })),
    projects
      .sort((a, b) => a.data.order - b.data.order)
      .map((p) => ({
        id: p.id,
        title: p.data.title,
        stack: p.data.stack.map((ref) => ref.id),
      })),
  );
}
