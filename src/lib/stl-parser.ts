import { STLMesh } from '@/types/openscad';

export function parseSTL(buffer: ArrayBuffer): STLMesh {
  const dataView = new DataView(buffer);
  
  // Check if binary or ASCII
  const header = new Uint8Array(buffer, 0, 80);
  const headerString = new TextDecoder().decode(header);
  
  if (headerString.startsWith('solid') && !isBinarySTL(buffer)) {
    return parseASCIISTL(buffer);
  }
  
  return parseBinarySTL(dataView);
}

function isBinarySTL(buffer: ArrayBuffer): boolean {
  // Binary STL has 80-byte header + 4-byte triangle count + triangle data
  // Check if the expected size matches
  const dataView = new DataView(buffer);
  const triangleCount = dataView.getUint32(80, true);
  const expectedSize = 80 + 4 + (triangleCount * 50);
  return Math.abs(buffer.byteLength - expectedSize) < 10;
}

function parseBinarySTL(dataView: DataView): STLMesh {
  const triangleCount = dataView.getUint32(80, true);
  const vertices = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  
  let offset = 84;
  
  for (let i = 0; i < triangleCount; i++) {
    // Read normal
    const nx = dataView.getFloat32(offset, true);
    const ny = dataView.getFloat32(offset + 4, true);
    const nz = dataView.getFloat32(offset + 8, true);
    offset += 12;
    
    // Read 3 vertices
    for (let j = 0; j < 3; j++) {
      const vertexIndex = i * 9 + j * 3;
      vertices[vertexIndex] = dataView.getFloat32(offset, true);
      vertices[vertexIndex + 1] = dataView.getFloat32(offset + 4, true);
      vertices[vertexIndex + 2] = dataView.getFloat32(offset + 8, true);
      
      normals[vertexIndex] = nx;
      normals[vertexIndex + 1] = ny;
      normals[vertexIndex + 2] = nz;
      
      offset += 12;
    }
    
    // Skip attribute byte count
    offset += 2;
  }
  
  return { vertices, normals };
}

function parseASCIISTL(buffer: ArrayBuffer): STLMesh {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split('\n');
  
  const vertices: number[] = [];
  const normals: number[] = [];
  let currentNormal = [0, 0, 0];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('facet normal')) {
      const parts = trimmed.split(/\s+/);
      currentNormal = [
        parseFloat(parts[2]),
        parseFloat(parts[3]),
        parseFloat(parts[4]),
      ];
    } else if (trimmed.startsWith('vertex')) {
      const parts = trimmed.split(/\s+/);
      vertices.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      );
      normals.push(...currentNormal);
    }
  }
  
  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
  };
}

export function stlToOpenSCAD(mesh: STLMesh): string {
  const vertices = mesh.vertices;
  const triangleCount = vertices.length / 9;
  
  // Build unique points and faces
  const points: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  const pointMap = new Map<string, number>();
  
  const getPointIndex = (x: number, y: number, z: number): number => {
    // Round to 6 decimal places to handle floating point imprecision
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    
    if (pointMap.has(key)) {
      return pointMap.get(key)!;
    }
    
    const index = points.length;
    points.push([x, y, z]);
    pointMap.set(key, index);
    return index;
  };
  
  for (let i = 0; i < triangleCount; i++) {
    const baseIndex = i * 9;
    const face: [number, number, number] = [
      getPointIndex(vertices[baseIndex], vertices[baseIndex + 1], vertices[baseIndex + 2]),
      getPointIndex(vertices[baseIndex + 3], vertices[baseIndex + 4], vertices[baseIndex + 5]),
      getPointIndex(vertices[baseIndex + 6], vertices[baseIndex + 7], vertices[baseIndex + 8]),
    ];
    faces.push(face);
  }
  
  // Generate OpenSCAD code
  const pointsStr = points
    .map(([x, y, z]) => `    [${x.toFixed(6)}, ${y.toFixed(6)}, ${z.toFixed(6)}]`)
    .join(',\n');
  
  const facesStr = faces
    .map(([a, b, c]) => `    [${a}, ${b}, ${c}]`)
    .join(',\n');
  
  return `// Imported from STL file
// ${points.length} vertices, ${faces.length} faces

polyhedron(
  points = [
${pointsStr}
  ],
  faces = [
${facesStr}
  ]
);
`;
}
