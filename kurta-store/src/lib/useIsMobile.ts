'use client';

import { useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean | null {
  return null; // unknown until we're on the client
}

// null until resolved on the client (SSR/hydration can't know the viewport);
// true/false afterward, tracking the viewport live via matchMedia.
export function useIsMobile(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Touch-primary devices (phones AND tablets), regardless of CSS viewport
// width — a tablet in landscape is often >=1024px wide but is still a touch
// device, not a mouse/trackpad-driven desktop. `pointer: coarse` is the
// actual signal; the width clause is only a safety net for environments
// without reliable pointer/hover media-feature support.
const TOUCH_QUERY = '(pointer: coarse), (max-width: 767px)';

function subscribeTouch(onChange: () => void) {
  const mql = window.matchMedia(TOUCH_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getTouchSnapshot(): boolean {
  return window.matchMedia(TOUCH_QUERY).matches;
}

export function useIsTouchDevice(): boolean | null {
  return useSyncExternalStore(subscribeTouch, getTouchSnapshot, getServerSnapshot);
}
