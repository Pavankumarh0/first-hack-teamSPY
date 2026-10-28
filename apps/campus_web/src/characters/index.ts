// The animated characters, registered once for both uses:
//   - the website plays them live with @remotion/player (CharacterPlayer.tsx)
//   - `npm run characters:render` renders them to animated WebP for the app
//     (remotion/Root.tsx, scripts/render-characters.mjs)
import type { ComponentType } from 'react';
import { MapWalk } from './MapWalk';
import { Mithra } from './Mithra';
import { PhoneQr } from './PhoneQr';
import { FPS, LOOP } from './parts';

export interface Character {
  id: string;
  component: ComponentType;
  /** The frame shown when motion is reduced, and as the app's still image. */
  stillFrame: number;
}

export const CHARACTERS = {
  mithra: { id: 'Mithra', component: Mithra, stillFrame: 0 },
  phone: { id: 'PhoneQr', component: PhoneQr, stillFrame: 58 },
  map: { id: 'MapWalk', component: MapWalk, stillFrame: 96 },
} satisfies Record<string, Character>;

export type CharacterName = keyof typeof CHARACTERS;
export const CHARACTER_FPS = FPS;
export const CHARACTER_FRAMES = LOOP;
export const CHARACTER_SIZE = 240;
