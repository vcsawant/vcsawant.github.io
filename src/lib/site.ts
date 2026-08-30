/*
 * Single source of truth for identity links. Links render ONLY when set —
 * an empty string means "not yet provided" and the UI omits it entirely,
 * so placeholder text can never leak into an href (see CONTENT-TODO.md).
 */
export const site = {
  email: 'viren.c.sawant@gmail.com',
  github: 'https://github.com/vcsawant',
  linkedin: '', // {{TODO: LinkedIn URL — see CONTENT-TODO.md}}
  // Flip to true when the current resume lands at public/resume.pdf.
  resumeAvailable: false,
};
