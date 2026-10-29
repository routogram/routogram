/**
 * Next.js processes global CSS, but editors running plain TypeScript may not
 * load the generated next-env.d.ts declarations. Keep CSS side-effect imports
 * typed even before `next dev`/`next build` has generated editor metadata.
 */
declare module "*.css";
