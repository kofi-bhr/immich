import { getAssetRatio } from '$lib/utils/asset-utils';
import type { DateGroup } from '$lib/utils/timeline-util';
// note: it's important that this is not imported in more than one file due to https://github.com/sveltejs/kit/issues/7805
import { JustifiedLayout, type LayoutOptions } from '@immich/justified-layout-wasm';
import type { AssetResponseDto } from '@immich/sdk';

export type GetJustifiedLayout = typeof getJustifiedLayoutFromAssets;

export function getJustifiedLayoutFromAssets(assets: AssetResponseDto[], options: LayoutOptions) {
  const aspectRatios = new Float32Array(assets.length);
  // eslint-disable-next-line unicorn/no-for-loop
  for (let i = 0; i < assets.length; i++) {
    const { width, height } = getAssetRatio(assets[i]);
    aspectRatios[i] = width / height;
  }
  return new JustifiedLayout(aspectRatios, options);
}
