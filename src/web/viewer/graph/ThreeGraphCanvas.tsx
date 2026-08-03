import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { JSX } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphLayout, GraphLayoutNode } from "./graphModel";
import { assetThreeColor } from "./graphTheme";

export function ThreeGraphCanvas(props: {
  layout: GraphLayout;
  selectedGuid: string | null;
  hoverGuid: string | null;
  onHover(ref: string | null): void;
  onSelect(ref: string): void;
}): JSX.Element {
  const cameraDistance = Math.max(260, props.layout.sceneRadius * 2.35);

  return (
    <div className="three-graph" data-testid="three-graph">
      <Canvas
        camera={{ fov: 48, near: 0.1, far: 5000, position: [0, 0, cameraDistance] }}
        dpr={[1, 1.7]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color args={["#0b0d10"]} attach="background" />
        <ambientLight intensity={0.88} />
        <directionalLight intensity={1.2} position={[160, 220, 260]} />
        <GraphScene
          hoverGuid={props.hoverGuid}
          layout={props.layout}
          onHover={props.onHover}
          onSelect={props.onSelect}
          selectedGuid={props.selectedGuid}
        />
        <CameraControls sceneRadius={props.layout.sceneRadius} />
      </Canvas>
    </div>
  );
}

function GraphScene(props: {
  layout: GraphLayout;
  selectedGuid: string | null;
  hoverGuid: string | null;
  onHover(ref: string | null): void;
  onSelect(ref: string): void;
}): JSX.Element {
  return (
    <group>
      <EdgeSegments layout={props.layout} />
      <NodeInstances
        hoverGuid={props.hoverGuid}
        layout={props.layout}
        onHover={props.onHover}
        onSelect={props.onSelect}
        selectedGuid={props.selectedGuid}
      />
    </group>
  );
}

function NodeInstances(props: {
  layout: GraphLayout;
  selectedGuid: string | null;
  hoverGuid: string | null;
  onHover(ref: string | null): void;
  onSelect(ref: string): void;
}): JSX.Element | null {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    props.layout.nodes.forEach((node, index) => {
      const selected = node.id === props.selectedGuid;
      const hovered = node.id === props.hoverGuid;
      const scale = node.radius * (selected ? 1.55 : hovered ? 1.28 : 1);
      dummy.position.set(node.x, node.y, node.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, colorForNode(color, node, selected, hovered));
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [color, dummy, props.hoverGuid, props.layout.nodes, props.selectedGuid]);

  if (props.layout.nodes.length === 0) return null;

  return (
    <instancedMesh
      args={[undefined, undefined, props.layout.nodes.length]}
      onClick={(event) => {
        event.stopPropagation();
        const node = nodeFromInstance(props.layout.nodes, event.instanceId);
        if (node) props.onSelect(node.id);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        const node = nodeFromInstance(props.layout.nodes, event.instanceId);
        props.onHover(node?.id ?? null);
      }}
      onPointerOut={() => props.onHover(null)}
      ref={meshRef}
    >
      <sphereGeometry args={[1, 14, 10]} />
      <meshStandardMaterial roughness={0.62} vertexColors />
    </instancedMesh>
  );
}

function EdgeSegments(props: { layout: GraphLayout }): JSX.Element | null {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();

    for (const edge of props.layout.edges) {
      const source = props.layout.nodesById.get(edge.source);
      const target = props.layout.nodesById.get(edge.target);
      if (!source || !target) continue;
      const edgeColor = color.set(assetThreeColor(source.type)).multiplyScalar(0.58);
      positions.push(source.x, source.y, source.z, target.x, target.y, target.z);
      colors.push(edgeColor.r, edgeColor.g, edgeColor.b, edgeColor.r, edgeColor.g, edgeColor.b);
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    buffer.computeBoundingSphere();
    return buffer;
  }, [props.layout]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (props.layout.edges.length === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial transparent opacity={0.36} vertexColors />
    </lineSegments>
  );
}

function CameraControls(props: { sceneRadius: number }): null {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 40;
    controls.maxDistance = Math.max(600, props.sceneRadius * 5);
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl.domElement, props.sceneRadius]);

  useFrame(() => controlsRef.current?.update());
  return null;
}

function colorForNode(
  reusableColor: THREE.Color,
  node: GraphLayoutNode,
  selected: boolean,
  hovered: boolean,
): THREE.Color {
  if (selected) return reusableColor.set("#f4f7fb");
  if (hovered) return reusableColor.set(assetThreeColor(node.type)).lerp(new THREE.Color("#ffffff"), 0.28);
  return reusableColor.set(assetThreeColor(node.type));
}

function nodeFromInstance(nodes: GraphLayoutNode[], instanceId: number | undefined): GraphLayoutNode | undefined {
  return instanceId === undefined ? undefined : nodes[instanceId];
}
