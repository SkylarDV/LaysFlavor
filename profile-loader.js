import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const DEFAULT_IMAGE = '/assets/chipspreview.png';
const MODEL_PATH = '/assets/chips.glb';

const FONT_STACKS = {
  standard: 'bold 300px "Helvetica Neue", Helvetica, Arial, "Segoe UI", system-ui, sans-serif',
  decorative: 'bold 300px "Segoe Script", "Kaushan Script", "Courgette", "Sacramento", cursive',
  classic: 'bold 300px Georgia, "Times New Roman", Times, serif'
};

function resolveFont(alias) {
  return FONT_STACKS[alias] || FONT_STACKS.standard;
}

function createTextTexture(text, color = 'white', fontAlias = 'standard') {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(1, -1.5);
  ctx.fillStyle = color === 'black' ? '#000' : '#fff';
  ctx.font = resolveFont(fontAlias);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text || '', canvas.width / 2, -canvas.height / 2);
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContainedTextureFromImage(img) {
  const canvasW = 2048;
  const canvasH = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.save();
  ctx.translate(0, canvasH);
  ctx.scale(1, -1);
  const scale = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const dx = (canvasW - drawW) / 2;
  const dy = (canvasH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const modelPromise = new Promise((resolve, reject) => {
  const loader = new GLTFLoader();
  loader.load(
    MODEL_PATH,
    (gltf) => {
      resolve(gltf);
    },
    (progress) => {},
    (err) => {
      reject(err);
    }
  );
});

function cloneModel(gltf) {
  const clone = gltf.scene.clone(true);
  const skinnedMeshes = {};
  gltf.scene.traverse((node) => {
    if (node.isSkinnedMesh) skinnedMeshes[node.name] = node;
  });
  clone.traverse((node) => {
    if (node.isSkinnedMesh) {
      const original = skinnedMeshes[node.name];
      if (original) {
        node.skeleton = original.skeleton;
        node.bind(node.skeleton, new THREE.Matrix4());
      }
    }
  });
  return clone;
}

// Override renderBagCard to use Three.js
window.renderBagCard = async function (bag) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cursor = 'pointer';
  
  // Add click handler to redirect to preview page
  card.addEventListener('click', (e) => {
    // Don't redirect if clicking edit or delete buttons
    if (e.target.closest('button')) return;
    window.location.href = `/preview.html?id=${bag._id}`;
  });
  
  // Create canvas with explicit styling
  const canvas = document.createElement('canvas');
  canvas.width = 260;
  canvas.height = 240;
  canvas.className = 'thumb';
  canvas.style.display = 'block';
  canvas.style.background = '#f8f5ec';
  
  // Create edit button (pencil icon)
  const editBtn = document.createElement('button');
  editBtn.className = 'like-btn';
  editBtn.innerHTML = '✏️';
  editBtn.setAttribute('aria-label', 'Edit this bag');
  editBtn.title = 'Edit';
  editBtn.style.right = '48px';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Navigate to configurator with bag ID
    if (bag._id) {
      window.location.href = `/configurator.html?edit=${bag._id}`;
    }
  });
  
  // Create delete button (trash icon)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'like-btn';
  deleteBtn.innerHTML = '🗑️';
  deleteBtn.setAttribute('aria-label', 'Delete this bag');
  deleteBtn.title = 'Delete';
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this bag?')) {
      return;
    }
    
    try {
      const res = await fetch(`https://laysflavorapi.onrender.com/api/bag/${bag._id}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) throw new Error('Delete failed');
      
      // Remove card from grid
      card.remove();
      
      // Check if grid is empty
      const grid = document.getElementById('grid');
      if (grid.children.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
      }
    } catch (err) {
      alert('Failed to delete bag');
    }
  });
  
  const meta = document.createElement('div');
  meta.className = 'meta';
  const nameEl = document.createElement('div');
  nameEl.className = 'name';
  nameEl.textContent = bag.name || 'Unnamed Flavor';
  const descEl = document.createElement('div');
  descEl.className = 'desc';
  descEl.textContent = bag.flavor || 'Custom Lays bag';
  meta.append(nameEl, descEl);
  
  const grid = document.getElementById('grid');
  card.append(canvas, editBtn, deleteBtn, meta);
  grid.appendChild(card);

  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas });
    renderer.setSize(260, 240, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xf8f5ec, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 260 / 240, 0.1, 100);
    camera.position.set(0, 0.6, 2.0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 8, 6);
    scene.add(dir);

    const gltf = await modelPromise;
    const model = cloneModel(gltf);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar((1 / maxDim) * 2.2);
    model.position.set(0, 0.2, -0.6);
    model.rotation.x = Math.PI / 12;
    model.rotation.y = Math.PI / 6;

    let meshIndex = 0;
    let bagMat = null;
    let textMesh = null;
    let imageMesh = null;

    model.traverse((n) => {
      if (n.isMesh) {
        if (!bagMat) {
          bagMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(bag.colour || '#b6352a'), metalness: 0.1, roughness: 0.3 });
          n.material = bagMat;
        }
        if (meshIndex === 2) {
          textMesh = n;
          textMesh.material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 1, metalness: 0.1, roughness: 0.3 });
        }
        if (meshIndex === 3) {
          imageMesh = n;
          imageMesh.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false });
        }
        meshIndex++;
      }
    });

    if (bagMat && bag.colour) bagMat.color.set(bag.colour);

    if (textMesh) {
      const textTex = createTextTexture(bag.name || 'Classic', (bag.textColour || 'white').toLowerCase(), bag.font || 'standard');
      textMesh.material.map = textTex;
      textMesh.material.needsUpdate = true;
    }

    scene.add(model);
    renderer.render(scene, camera);

    // Load image async
    if (imageMesh) {
      loadImage(bag.bagImage || DEFAULT_IMAGE)
        .then(img => {
          const tex = createContainedTextureFromImage(img);
          imageMesh.material.map = tex;
          imageMesh.material.opacity = 1;
          imageMesh.material.needsUpdate = true;
          renderer.render(scene, camera);
        })
        .catch(err => {
          if (bag.bagImage !== DEFAULT_IMAGE) {
            loadImage(DEFAULT_IMAGE).then(img => {
              const tex = createContainedTextureFromImage(img);
              imageMesh.material.map = tex;
              imageMesh.material.opacity = 1;
              imageMesh.material.needsUpdate = true;
              renderer.render(scene, camera);
            });
          }
        });
    }
  } catch (err) {
    if (grid.contains(card)) grid.removeChild(card);
  }
};
