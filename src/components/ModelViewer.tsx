import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { STLMesh } from '@/types/openscad';

interface ModelViewerProps {
  meshData: STLMesh | null;
  isRendering?: boolean;
  error?: string | null;
}

function MeshModel({ meshData }: { meshData: STLMesh }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(meshData.vertices, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }, [meshData]);

  const centerOffset = useMemo(() => {
    if (geometry.boundingBox) {
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      return center.negate();
    }
    return new THREE.Vector3();
  }, [geometry]);

  const scale = useMemo(() => {
    if (geometry.boundingBox) {
      const size = new THREE.Vector3();
      geometry.boundingBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      return maxDim > 0 ? 30 / maxDim : 1;
    }
    return 1;
  }, [geometry]);

  return (
    <group scale={scale} position={centerOffset.multiplyScalar(scale)}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#4a9eff"
          metalness={0.3}
          roughness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#1a1a2e"
          wireframe
          transparent
          opacity={0.1}
        />
      </mesh>
    </group>
  );
}

function LoadingIndicator() {
  return (
    <mesh>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#4a9eff" wireframe />
    </mesh>
  );
}

function PlaceholderModel() {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[10, 10, 10]} />
        <meshStandardMaterial
          color="#4a9eff"
          metalness={0.3}
          roughness={0.5}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[3, 3, 12, 32]} />
        <meshStandardMaterial
          color="#1a2030"
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>
    </group>
  );
}

export function ModelViewer({ meshData, isRendering, error }: ModelViewerProps) {
  const renderContent = () => {
    if (isRendering) {
      return <LoadingIndicator />;
    }
    if (meshData) {
      return <MeshModel meshData={meshData} />;
    }
    return <PlaceholderModel />;
  };

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-viewer">
      <Canvas>
        <PerspectiveCamera makeDefault position={[40, 30, 40]} fov={50} />
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={10}
          maxDistance={200}
        />
        
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
        <directionalLight position={[-10, 10, -10]} intensity={0.5} />
        <pointLight position={[0, 20, 0]} intensity={0.3} />
        
        <Suspense fallback={<LoadingIndicator />}>
          {renderContent()}
        </Suspense>
        
        <Grid
          position={[0, -15, 0]}
          args={[100, 100]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#2a3040"
          sectionSize={20}
          sectionThickness={1}
          sectionColor="#3a4560"
          fadeDistance={100}
          fadeStrength={1}
          followCamera={false}
        />
        
        <Environment preset="city" />
      </Canvas>
      
      {/* Overlay info */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <div className="rounded bg-card/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          Drag to rotate • Scroll to zoom • Right-click to pan
        </div>
        {isRendering && (
          <div className="rounded bg-primary/80 px-2 py-1 text-xs text-primary-foreground backdrop-blur-sm animate-pulse">
            Rendering...
          </div>
        )}
      </div>
      
      {/* Error overlay */}
      {error && (
        <div className="absolute top-3 left-3 right-3 max-h-32 overflow-auto rounded bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground backdrop-blur-sm">
          <div className="font-medium mb-1">OpenSCAD Error:</div>
          <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
        </div>
      )}
    </div>
  );
}
