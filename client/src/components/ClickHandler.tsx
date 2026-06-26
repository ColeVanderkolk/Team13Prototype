import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

interface ClickHandlerProps {
  spacing: number;
  onPing: (x: number, y: number) => void;
  isDevMode?: boolean;
  gridWidth: number;
  gridHeight: number;
  onDevNodeClick?: (gridX: number, gridY: number) => void;
  onDevNodeRightClick?: (gridX: number, gridY: number) => void;
}

const MAX_GRID = 26;
const CLICK_RADIUS = 0.8;

export const ClickHandler = ({ spacing, onPing, isDevMode, gridWidth, gridHeight, onDevNodeClick, onDevNodeRightClick }: ClickHandlerProps) => {
  const { camera, gl } = useThree();

  // Refs for drag state so event handlers always see current values
  const isDragging = useRef(false);
  const dragButton = useRef<number | null>(null); // 0 = left (paint), 2 = right (clear)
  const visitedNodes = useRef(new Set<string>());

  useEffect(() => {
    const getGridCoordsFromEvent = (event: MouseEvent): { gridX: number; gridY: number } | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 2.5);
      const intersection = new THREE.Vector3();

      if (!raycaster.ray.intersectPlane(plane, intersection)) return null;

      const center = Math.floor(MAX_GRID / 2);
      const halfWidth = Math.floor(gridWidth / 2);
      const halfHeight = Math.floor(gridHeight / 2);
      const minX = center - halfWidth;
      const minY = center - halfHeight;
      const offsetX = (gridWidth - 1) / 2;
      const offsetZ = (gridHeight - 1) / 2;

      const gridX = Math.round(intersection.x / spacing + offsetX) + minX;
      const gridY = Math.round(intersection.z / spacing + offsetZ) + minY;

      // Distance check to node center
      const relativeX = gridX - minX;
      const relativeY = gridY - minY;
      const nodeCenterX = (relativeX - offsetX) * spacing;
      const nodeCenterZ = (relativeY - offsetZ) * spacing;
      const dx = intersection.x - nodeCenterX;
      const dz = intersection.z - nodeCenterZ;
      const distanceToCenter = Math.sqrt(dx * dx + dz * dz);

      if (gridX >= 0 && gridX < MAX_GRID && gridY >= 0 && gridY < MAX_GRID && distanceToCenter <= CLICK_RADIUS) {
        return { gridX, gridY };
      }
      return null;
    };

    const applyToNode = (gridX: number, gridY: number, button: number) => {
      if (button === 0 && onDevNodeClick) {
        onDevNodeClick(gridX, gridY);
      } else if (button === 2 && onDevNodeRightClick) {
        onDevNodeRightClick(gridX, gridY);
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (isDevMode && (event.button === 0 || event.button === 2)) {
        // Dev mode: start drag painting/clearing
        const coords = getGridCoordsFromEvent(event);
        isDragging.current = true;
        dragButton.current = event.button;
        visitedNodes.current.clear();

        if (coords) {
          const key = `${coords.gridX},${coords.gridY}`;
          visitedNodes.current.add(key);
          applyToNode(coords.gridX, coords.gridY, event.button);
        }
      } else if (event.button === 0) {
        // Non-dev mode: ping on left click
        const rect = gl.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 2.5);
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersection)) {
          onPing(intersection.x, intersection.z);
        }
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current || dragButton.current === null || !isDevMode) return;

      const coords = getGridCoordsFromEvent(event);
      if (coords) {
        const key = `${coords.gridX},${coords.gridY}`;
        if (!visitedNodes.current.has(key)) {
          visitedNodes.current.add(key);
          applyToNode(coords.gridX, coords.gridY, dragButton.current);
        }
      }
    };

    const stopDrag = () => {
      isDragging.current = false;
      dragButton.current = null;
      visitedNodes.current.clear();
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (isDevMode) {
        event.preventDefault();
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", stopDrag);
    canvas.addEventListener("mouseleave", stopDrag);
    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", stopDrag);
      canvas.removeEventListener("mouseleave", stopDrag);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [camera, gl, onPing, isDevMode, gridWidth, gridHeight, onDevNodeClick, onDevNodeRightClick, spacing]);

  return null;
};
