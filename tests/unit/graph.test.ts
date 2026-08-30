import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  neighborsOf,
  nodeIndexMap,
  type ProjectInput,
  type SkillInput,
} from '../../src/lib/graph';

const skills: SkillInput[] = [
  { id: 'elixir', label: 'Elixir', category: 'language', weight: 4 },
  { id: 'typescript', label: 'TypeScript', category: 'language', weight: 5 },
  { id: 'react', label: 'React', category: 'framework', weight: 5 },
  { id: 'cobol', label: 'COBOL', category: 'language', weight: 1 }, // orphan
];

const projects: ProjectInput[] = [
  { id: 'bughouse', title: 'Bughouse', stack: ['elixir'] },
  { id: 'tracker', title: 'Tracker', stack: ['typescript', 'react'] },
];

describe('buildGraph', () => {
  it('includes used skills and all projects as nodes, excludes orphan skills', () => {
    const g = buildGraph(skills, projects);
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain('elixir');
    expect(ids).toContain('typescript');
    expect(ids).toContain('react');
    expect(ids).toContain('bughouse');
    expect(ids).toContain('tracker');
    expect(ids).not.toContain('cobol');
  });

  it('creates one edge per (project, stack entry)', () => {
    const g = buildGraph(skills, projects);
    expect(g.edges).toHaveLength(3);
    expect(g.edges).toContainEqual({ source: 'bughouse', target: 'elixir' });
    expect(g.edges).toContainEqual({ source: 'tracker', target: 'typescript' });
    expect(g.edges).toContainEqual({ source: 'tracker', target: 'react' });
  });

  it('marks kinds and categories: projects are category "project"', () => {
    const g = buildGraph(skills, projects);
    const bughouse = g.nodes.find((n) => n.id === 'bughouse');
    const elixir = g.nodes.find((n) => n.id === 'elixir');
    expect(bughouse).toMatchObject({ kind: 'project', category: 'project', label: 'Bughouse' });
    expect(elixir).toMatchObject({ kind: 'skill', category: 'language', label: 'Elixir' });
  });

  it('weights: skills keep their weight, projects get 2 + stack.length/4', () => {
    const g = buildGraph(skills, projects);
    expect(g.nodes.find((n) => n.id === 'elixir')?.weight).toBe(4);
    expect(g.nodes.find((n) => n.id === 'bughouse')?.weight).toBe(2.25);
    expect(g.nodes.find((n) => n.id === 'tracker')?.weight).toBe(2.5);
  });

  it('ids are unique and output is deterministic for the same input', () => {
    const g1 = buildGraph(skills, projects);
    const g2 = buildGraph(skills, projects);
    expect(new Set(g1.nodes.map((n) => n.id)).size).toBe(g1.nodes.length);
    expect(g1).toEqual(g2);
  });

  it('neighborsOf returns connected node ids in both directions', () => {
    const g = buildGraph(skills, projects);
    expect(neighborsOf(g, 'tracker')).toEqual(new Set(['typescript', 'react']));
    expect(neighborsOf(g, 'elixir')).toEqual(new Set(['bughouse']));
  });

  it('nodeIndexMap maps every node id to its array index', () => {
    const g = buildGraph(skills, projects);
    const m = nodeIndexMap(g);
    expect(m.size).toBe(g.nodes.length);
    g.nodes.forEach((n, i) => expect(m.get(n.id)).toBe(i));
  });

  it('throws on a stack reference to an unknown skill', () => {
    expect(() =>
      buildGraph(skills, [{ id: 'bad', title: 'Bad', stack: ['does-not-exist'] }]),
    ).toThrow(/does-not-exist/);
  });
});
