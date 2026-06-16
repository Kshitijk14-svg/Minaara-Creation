// Re-exports the root home page.
// Next.js App Router requires page files in route groups to have a default export.
// This file and src/app/page.tsx both resolve to '/', so one will shadow the other.
// To avoid the conflict, we just re-export from the root page.
// NOTE: In production, use a dedicated layout group WITHOUT a page.tsx if no /index is needed.
export { default } from '@/app/page';
