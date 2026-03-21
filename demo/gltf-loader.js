function decodeDataUri(uri) {
  const match = /^data:.*?;base64,(.+)$/i.exec(uri);
  if (!match) {
    throw new Error(`Unsupported glTF buffer URI: ${uri.slice(0, 48)}`);
  }

  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function getComponentArray(componentType, buffer, byteOffset, count) {
  switch (componentType) {
    case 5123:
      return new Uint16Array(buffer, byteOffset, count);
    case 5125:
      return new Uint32Array(buffer, byteOffset, count);
    case 5126:
      return new Float32Array(buffer, byteOffset, count);
    default:
      throw new Error(`Unsupported glTF componentType: ${componentType}`);
  }
}

function getTypeSize(type) {
  switch (type) {
    case "SCALAR":
      return 1;
    case "VEC2":
      return 2;
    case "VEC3":
      return 3;
    case "VEC4":
      return 4;
    default:
      throw new Error(`Unsupported glTF accessor type: ${type}`);
  }
}

function readAccessor(document, accessorIndex, buffers) {
  const accessor = document.accessors[accessorIndex];
  const bufferView = document.bufferViews[accessor.bufferView];
  const buffer = buffers[bufferView.buffer];
  const componentCount = getTypeSize(accessor.type);
  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const valueCount = accessor.count * componentCount;
  return getComponentArray(accessor.componentType, buffer, byteOffset, valueCount);
}

function getMaterialColor(document, primitive) {
  const material = document.materials?.[primitive.material] ?? null;
  const factor =
    material?.pbrMetallicRoughness?.baseColorFactor ?? [0.56, 0.33, 0.22, 1];
  return {
    r: factor[0],
    g: factor[1],
    b: factor[2],
    a: factor[3] ?? 1,
  };
}

function computeBounds(positions) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < positions.length; index += 3) {
    min[0] = Math.min(min[0], positions[index]);
    min[1] = Math.min(min[1], positions[index + 1]);
    min[2] = Math.min(min[2], positions[index + 2]);
    max[0] = Math.max(max[0], positions[index]);
    max[1] = Math.max(max[1], positions[index + 1]);
    max[2] = Math.max(max[2], positions[index + 2]);
  }
  return { min, max };
}

export async function loadGltfModel(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load glTF asset: ${response.status} ${response.statusText}`);
  }

  const document = await response.json();
  const buffers = await Promise.all(
    (document.buffers ?? []).map(async (buffer) => {
      if (typeof buffer.uri !== "string") {
        throw new Error("glTF buffer URI is required for demo asset loading.");
      }
      if (buffer.uri.startsWith("data:")) {
        return decodeDataUri(buffer.uri);
      }
      const nested = await fetch(new URL(buffer.uri, url));
      if (!nested.ok) {
        throw new Error(`Failed to load glTF buffer: ${nested.status} ${nested.statusText}`);
      }
      return nested.arrayBuffer();
    })
  );

  const scene = document.scenes?.[document.scene ?? 0];
  if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) {
    throw new Error("glTF demo asset must expose a default scene with at least one node.");
  }

  const node = document.nodes[scene.nodes[0]];
  const mesh = document.meshes[node.mesh];
  const primitive = mesh.primitives[0];
  const positions = Array.from(readAccessor(document, primitive.attributes.POSITION, buffers));
  const indices = Array.from(readAccessor(document, primitive.indices, buffers));

  return Object.freeze({
    name: node.name ?? mesh.name ?? "gltf-model",
    positions,
    indices,
    bounds: computeBounds(positions),
    color: getMaterialColor(document, primitive),
    physics: Object.freeze({ ...(node.extras?.physics ?? {}) }),
  });
}
