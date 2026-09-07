import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LineSegments, Mesh, type Group } from "three";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/**
 * Releases the GPU resources of a scene graph the viewer has stopped showing.
 * three.js frees nothing on garbage collection, so a re-imported model would
 * otherwise leak every geometry and material of the previous one — the GLB's
 * own, and the outlines and markers the viewer attached to it — for the life
 * of the WebGL context.
 */
function disposeSceneGraph(root: Group): void {
  root.traverse((child) => {
    if (!(child instanceof Mesh) && !(child instanceof LineSegments)) {
      return;
    }
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

/**
 * Downloads the building's scene.glb through the authenticated SDK client
 * and parses it into a three.js scene graph.
 *
 * The query key carries `updatedAt` so a re-uploaded model busts the cache;
 * the HTTP layer still benefits from the server's ETag/immutable caching.
 * Structural sharing is disabled — the cached value is a mutable three.js
 * object, not serializable data.
 */
export function useModelScene(assetId: string, updatedAt: string | undefined) {
  const client = useGridoneClient();
  const query = useQuery<Group>({
    queryKey: ["assets", assetId, "model-scene", updatedAt],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60_000,
    structuralSharing: false,
    queryFn: async () => {
      // updatedAt versions the URL: the scene is immutable-cached by the
      // browser, so a replaced model must be fetched from a new URL.
      const blob = await client.assets.getModelScene(assetId, updatedAt);
      const buffer = await blob.arrayBuffer();
      const gltf = await new GLTFLoader().parseAsync(buffer, "");
      return gltf.scene;
    },
  });

  const scene = query.data ?? null;
  // Release the scene this one replaces — never the current one, which the
  // query cache may still serve to a remount.
  const shownRef = useRef<Group | null>(null);
  useEffect(() => {
    const previous = shownRef.current;
    shownRef.current = scene;
    if (previous && previous !== scene) {
      disposeSceneGraph(previous);
    }
  }, [scene]);

  return {
    scene,
    isLoading: query.isLoading,
    error: query.error,
  };
}
