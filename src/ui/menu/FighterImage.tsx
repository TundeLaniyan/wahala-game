import { useState } from 'react';
import type { CharacterId } from '../../sim';
import { portraitUrl } from '../../assets/portraits';
import type { Art } from './art';

/** A fighter's menu portrait: the approved artwork, or the rendered in-game bust when there is none. */
export function FighterImage({ id, art, sizes }: { id: CharacterId; art: Art | null; sizes: string }) {
  const [failed, setFailed] = useState(false);
  if (art && !failed)
    return (
      <img
        className="mn-fighter-img"
        src={art.src}
        srcSet={art.srcSet}
        sizes={sizes}
        alt=""
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  return <img className="mn-fighter-img bust" src={portraitUrl(id, 0, 256)} alt="" />;
}
