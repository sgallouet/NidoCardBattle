export type MapRenderMode = 'tiled' | 'authored';

export const DEFAULT_MAP_RENDER_MODE: MapRenderMode = 'authored';

export const resolveMapRenderMode = (search: string): MapRenderMode => {
  const requested = new URLSearchParams(search).get('map');
  return requested === 'tiled' || requested === 'authored'
    ? requested
    : DEFAULT_MAP_RENDER_MODE;
};

const currentSearch = typeof window === 'undefined' ? '' : window.location.search;

export const MAP_RENDER_MODE = resolveMapRenderMode(currentSearch);
