<script lang="ts">
  import Icon from '$lib/components/elements/icon.svelte';
  import Skeleton from '$lib/components/photos-page/skeleton.svelte';
  import { AssetBucket, type AssetStore, type Viewport } from '$lib/stores/assets-store.svelte';
  import { navigate } from '$lib/utils/navigation';
  import { findTotalOffset, type DateGroup, type ScrollTargetListener } from '$lib/utils/timeline-util';
  import type { AssetResponseDto } from '@immich/sdk';
  import { mdiCheckCircle, mdiCircleOutline } from '@mdi/js';
  import { onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import Thumbnail from '../assets/thumbnail/thumbnail.svelte';
  import { TUNABLES } from '$lib/utils/tunables';
  import { generateId } from '$lib/utils/generate-id';
  import type { AssetInteraction } from '$lib/stores/asset-interaction.svelte';

  interface Props {
    isSelectionMode: boolean;
    singleSelect: boolean;
    withStacked: boolean;
    showArchiveIcon: boolean;
    assetGridElement: HTMLElement | undefined;
    renderThumbsAtBottomMargin: string | undefined;
    renderThumbsAtTopMargin: string | undefined;
    assetStore: AssetStore;
    bucket: AssetBucket;
    assetInteraction: AssetInteraction;
    absoluteHeight: number;

    onScrollTarget: ScrollTargetListener | undefined;
    onAssetInGrid: ((asset: AssetResponseDto) => void) | undefined;
    onSelect: ({ title, assets }: { title: string; assets: AssetResponseDto[] }) => void;
    onSelectAssets: (asset: AssetResponseDto) => void;
    onSelectAssetCandidates: (asset: AssetResponseDto | null) => void;
  }

  let {
    isSelectionMode,
    singleSelect,
    withStacked,
    showArchiveIcon,
    assetGridElement,
    renderThumbsAtBottomMargin,
    renderThumbsAtTopMargin,
    assetStore = $bindable(),
    bucket,
    assetInteraction,
    onScrollTarget,
    onSelect,
    onSelectAssets,
    onSelectAssetCandidates,
  }: Props = $props();

  const componentId = generateId();
  const bucketDate = $derived(bucket.bucketDate);
  const dateGroups = $derived(bucket.dateGroups);
  const absoluteDateGroupHeights = $derived(bucket.absoluteDateGroupHeights);
  const absoluteDateGroupWidths = $derived(bucket.absoluteDateGroupWidths);

  const {
    DATEGROUP: { INTERSECTION_ROOT_TOP, INTERSECTION_ROOT_BOTTOM, SMALL_GROUP_THRESHOLD },
  } = TUNABLES;
  /* TODO figure out a way to calculate this*/
  const TITLE_HEIGHT = 51;

  let isMouseOverGroup = $state(false);
  let hoveredDateGroup = $state('');

  const onClick = (assets: AssetResponseDto[], groupTitle: string, asset: AssetResponseDto) => {
    if (isSelectionMode || assetInteraction.selectionActive) {
      assetSelectHandler(asset, assets, groupTitle);
      return;
    }
    void navigate({ targetRoute: 'current', assetId: asset.id });
  };

  const onRetrieveElement = (dateGroup: DateGroup, asset: AssetResponseDto, element: HTMLElement) => {
    if (assetGridElement && onScrollTarget) {
      const offset = findTotalOffset(element, assetGridElement) - TITLE_HEIGHT;
      onScrollTarget({ bucket, dateGroup, asset, offset });
    }
  };

  const handleSelectGroup = (title: string, assets: AssetResponseDto[]) => onSelect({ title, assets });

  const assetSelectHandler = (asset: AssetResponseDto, assetsInDateGroup: AssetResponseDto[], groupTitle: string) => {
    onSelectAssets(asset);

    // Check if all assets are selected in a group to toggle the group selection's icon
    let selectedAssetsInGroupCount = assetsInDateGroup.filter((asset) =>
      assetInteraction.selectedAssets.has(asset),
    ).length;

    // if all assets are selected in a group, add the group to selected group
    if (selectedAssetsInGroupCount == assetsInDateGroup.length) {
      assetInteraction.addGroupToMultiselectGroup(groupTitle);
    } else {
      assetInteraction.removeGroupFromMultiselectGroup(groupTitle);
    }
  };

  const assetMouseEventHandler = (groupTitle: string, asset: AssetResponseDto | null) => {
    // Show multi select icon on hover on date group
    hoveredDateGroup = groupTitle;

    if (assetInteraction.selectionActive) {
      onSelectAssetCandidates(asset);
    }
  };

  onDestroy(() => {
    assetStore.taskManager.removeAllTasksForComponent(componentId);
  });
</script>

<div data-bucket={bucket.bucketDate} data-a={dateGroups.length}></div>

{#each dateGroups as dateGroup, groupIndex (dateGroup.date)}
  {@const absoluteHeight = absoluteDateGroupHeights[groupIndex]}
  {@const absoluteWidths = absoluteDateGroupWidths[dateGroup.row] || []}
  {@const absoluteWidth = absoluteWidths[dateGroup.col]}
  {@const geometry = dateGroup.geometry!}
  {@const display = dateGroup.intersecting}

  {#if display}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section
      style:position="absolute"
      style:transform={`translate3d(${absoluteWidth}px,${absoluteHeight}px,0)`}
      data-height={absoluteHeight}
      data-width={absoluteWidth}
      data-row={dateGroup.row}
      data-col={dateGroup.col}
      onmouseenter={() =>
        assetStore.taskManager.queueScrollSensitiveTask({
          componentId,
          task: () => {
            isMouseOverGroup = true;
            assetMouseEventHandler(dateGroup.groupTitle, null);
          },
        })}
      onmouseleave={() => {
        assetStore.taskManager.queueScrollSensitiveTask({
          componentId,
          task: () => {
            isMouseOverGroup = false;
            assetMouseEventHandler(dateGroup.groupTitle, null);
          },
        });
      }}
    >
      <!-- Date group title -->
      <div
        class="flex z-[100] pt-[calc(1.75rem+1px)] pb-5 h-6 place-items-center text-xs font-medium text-immich-fg bg-immich-bg dark:bg-immich-dark-bg dark:text-immich-dark-fg md:text-sm"
        style:width={geometry.containerWidth + 'px'}
      >
        {#if !singleSelect && ((hoveredDateGroup == dateGroup.groupTitle && isMouseOverGroup) || assetInteraction.selectedGroup.has(dateGroup.groupTitle))}
          <div
            transition:fly={{ x: -24, duration: 200, opacity: 0.5 }}
            class="inline-block px-2 hover:cursor-pointer"
            onclick={() => handleSelectGroup(dateGroup.groupTitle, dateGroup.assets)}
            onkeydown={() => handleSelectGroup(dateGroup.groupTitle, dateGroup.assets)}
          >
            {#if assetInteraction.selectedGroup.has(dateGroup.groupTitle)}
              <Icon path={mdiCheckCircle} size="24" color="#4250af" />
            {:else}
              <Icon path={mdiCircleOutline} size="24" color="#757575" />
            {/if}
          </div>
        {/if}

        <span class="w-full truncate first-letter:capitalize" title={dateGroup.groupTitle}>
          {dateGroup.groupTitle}
        </span>
      </div>

      <!-- Image grid -->
      <div
        class="relative overflow-clip"
        style:height={geometry.containerHeight + 'px'}
        style:width={geometry.containerWidth + 'px'}
      >
        {#each dateGroup.assets as asset, i (asset.id)}
          {@const isSmallGroup = dateGroup.assets.length <= SMALL_GROUP_THRESHOLD}
          <!-- getting these together here in this order is very cache-efficient -->
          {@const top = geometry.getTop(i)}
          {@const left = geometry.getLeft(i)}
          {@const width = geometry.getWidth(i)}
          {@const height = geometry.getHeight(i)}

          {@const displayAsset = dateGroup.assetsIntersecting[i]}
          {@const row = dateGroup.row}

          <!-- update ASSET_GRID_PADDING-->
          {#if displayAsset}
            <div
              data-display-asset={displayAsset + '-'}
              data-asset-id={asset.id}
              class="absolute"
              style:top={top + 'px'}
              style:left={left + 'px'}
              style:width={width + 'px'}
              style:height={height + 'px'}
            >
              <Thumbnail
                {dateGroup}
                {assetStore}
                intersectionConfig={{
                  root: assetGridElement,
                  bottom: renderThumbsAtBottomMargin,
                  top: renderThumbsAtTopMargin,
                }}
                retrieveElement={assetStore.pendingScrollAssetId === asset.id}
                onRetrieveElement={(element) => onRetrieveElement(dateGroup, asset, element)}
                showStackedIcon={withStacked}
                {showArchiveIcon}
                {asset}
                {groupIndex}
                onClick={(asset) => onClick(dateGroup.assets, dateGroup.groupTitle, asset)}
                onSelect={(asset) => assetSelectHandler(asset, dateGroup.assets, dateGroup.groupTitle)}
                onMouseEvent={() => assetMouseEventHandler(dateGroup.groupTitle, asset)}
                selected={assetInteraction.selectedAssets.has(asset) || assetStore.albumAssets.has(asset.id)}
                selectionCandidate={assetInteraction.assetSelectionCandidates.has(asset)}
                disabled={assetStore.albumAssets.has(asset.id)}
                thumbnailWidth={width}
                thumbnailHeight={height}
                eagerThumbhash={isSmallGroup}
              />
            </div>
          {/if}
        {/each}
      </div>
    </section>
  {/if}
{/each}

<style>
  section {
    contain: layout paint style;
  }
</style>
