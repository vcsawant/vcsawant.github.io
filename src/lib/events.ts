// Window CustomEvents — the ONLY channel between islands and the static page.
export const EV = {
  skillSelect: 'vs:skill-select', // detail: { skillId: string | null }
  graphReady: 'vs:graph-ready', // detail: { mode: 'webgl' | 'fallback' | 'static' }
} as const;

export interface SkillSelectDetail {
  skillId: string | null;
}

export interface GraphReadyDetail {
  mode: 'webgl' | 'fallback' | 'static';
}
