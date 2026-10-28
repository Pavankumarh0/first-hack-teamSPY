// Remotion project for the animated characters (also used live on the
// website). Preview: `npm run characters:studio`. Render the app's animated
// WebP assets: `npm run characters:render`.
import { Composition } from 'remotion';
import { CHARACTER_FPS, CHARACTER_FRAMES, CHARACTERS } from '../src/characters';

// 320 px: about 2x the size the app shows them at (~150 dp), and small files.
const RENDER_SIZE = 320;

export function RemotionRoot() {
  return (
    <>
      {Object.values(CHARACTERS).map((c) => (
        <Composition key={c.id} id={c.id} component={c.component} durationInFrames={CHARACTER_FRAMES} fps={CHARACTER_FPS}
          width={RENDER_SIZE} height={RENDER_SIZE} />
      ))}
    </>
  );
}
