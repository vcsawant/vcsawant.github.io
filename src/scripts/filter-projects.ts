import { EV, type SkillSelectDetail } from '../lib/events';

/*
 * The single owner of filter state in the DOM. Chips (and later the 3D graph)
 * dispatch EV.skillSelect; this applies it: card dimming, chip aria-pressed,
 * live-region announcement. Filtering is opacity/transform only — no layout.
 */
let current: string | null = null;

const cards = () => document.querySelectorAll<HTMLElement>('[data-project]');
const chips = () => document.querySelectorAll<HTMLButtonElement>('[data-skill-chip]');
const liveRegion = () => document.querySelector<HTMLElement>('[data-filter-live]');

function apply(skillId: string | null): void {
  current = skillId;
  let shown = 0;
  let label = '';

  cards().forEach((card) => {
    const skills = (card.dataset.skills ?? '').split(',');
    const match = skillId === null || skills.includes(skillId);
    card.classList.toggle('is-filtered', !match);
    if (match) {
      card.removeAttribute('aria-hidden');
      card.removeAttribute('inert');
      shown += 1;
    } else {
      card.setAttribute('aria-hidden', 'true');
      card.setAttribute('inert', '');
    }
  });

  chips().forEach((chip) => {
    const pressed = chip.dataset.skillChip === skillId;
    chip.setAttribute('aria-pressed', String(pressed));
    if (pressed) label = chip.textContent?.trim() ?? skillId ?? '';
  });

  const live = liveRegion();
  if (live) {
    live.textContent =
      skillId === null
        ? `Showing all ${shown} projects`
        : `Showing ${shown} ${shown === 1 ? 'project' : 'projects'} for ${label}`;
  }
}

window.addEventListener(EV.skillSelect, (e) => {
  const { skillId } = (e as CustomEvent<SkillSelectDetail>).detail;
  if (skillId === current) return;
  apply(skillId);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current !== null) {
    window.dispatchEvent(
      new CustomEvent<SkillSelectDetail>(EV.skillSelect, { detail: { skillId: null } }),
    );
  }
});

// View transitions swap the DOM but keep this module alive: fresh chips/cards
// arrive unpressed and unfiltered, so the state variable must match.
document.addEventListener('astro:page-load', () => {
  current = null;
});
