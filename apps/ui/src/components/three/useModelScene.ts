import { useQuery } from "@tanstack/react-query";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Group } from "three";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/**
 * Downloads the building's scene.glb through the authenticated SDK client
 * and parses it into a three.js scene graph.
 *
 * The query key carries `updatedAt` so a re-uploaded model busts the cache;
 * the HTTP layer still benefits from the server's ETag/immutable caching.
 * Structural sharing is disabled — the cached value is a mutable three.js
 * object, not serializable data.
 */
export function useModelScene(
  assetId: string | undefined,
  updatedAt: string | undefined,
) {
  const client = useGridoneClient();
  const query = useQuery<Group>({
    queryKey: ["assets", assetId, "model-scene", updatedAt],
    enabled: !!assetId,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60_000,
    structuralSharing: false,
    queryFn: async () => {
      // updatedAt versions the URL: the scene is immutable-cached by the
      // browser, so a replaced model must be fetched from a new URL.
      const blob = await client.assets.getModelScene(assetId!, updatedAt);
      const buffer = await blob.arrayBuffer();
      const gltf = await new GLTFLoader().parseAsync(buffer, "");
      return gltf.scene;
    },
  });
  return {
    scene: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
