/*
 * Pure derivation of the skill graph from content-collection data.
 * Consumed by: the build-time layout script, the server-rendered SVG fallback,
 * and the WebGL island. Inputs are plain objects (not astro:content entries)
 * so this stays testable and usable from node scripts.
 */
export type SkillCategory = 'language' | 'framework' | 'platform' | 'practice';

export interface SkillInput {
  id: string;
  label: string;
  category: SkillCategory;
  weight: number;
}

export interface ProjectInput {
  id: string;
  title: string;
  stack: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  kind: 'skill' | 'project';
  category: SkillCategory | 'project';
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildGraph(skills: SkillInput[], projects: ProjectInput[]): GraphData {
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const usedSkillIds = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const project of projects) {
    for (const skillId of project.stack) {
      if (!skillById.has(skillId)) {
        throw new Error(`Project "${project.id}" references unknown skill "${skillId}"`);
      }
      usedSkillIds.add(skillId);
      edges.push({ source: project.id, target: skillId });
    }
  }

  const nodes: GraphNode[] = [
    ...skills
      .filter((s) => usedSkillIds.has(s.id))
      .map((s) => ({
        id: s.id,
        label: s.label,
        kind: 'skill' as const,
        category: s.category,
        weight: s.weight,
      })),
    ...projects.map((p) => ({
      id: p.id,
      label: p.title,
      kind: 'project' as const,
      category: 'project' as const,
      weight: 2 + p.stack.length / 4,
    })),
  ];

  return { nodes, edges };
}
