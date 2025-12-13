import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

renderer.domElement.style.position = 'fixed';
renderer.domElement.style.left = '0';
renderer.domElement.style.top = '0';
renderer.domElement.style.zIndex = '0';
renderer.domElement.style.width = '100vw';
renderer.domElement.style.height = '100vh';

function updateRendererViewport() {
    const menuEl = document.getElementById('menu');
    const menuWidth = menuEl ? Math.round(menuEl.getBoundingClientRect().width) : 0;

    const visW = Math.max(1, window.innerWidth - menuWidth);
    const visH = Math.max(1, window.innerHeight);

    renderer.setSize(visW, visH);
    renderer.domElement.style.width = visW + 'px';
    renderer.domElement.style.height = visH + 'px';
    renderer.domElement.style.right = menuWidth + 'px';

    if (camera) {
        camera.aspect = visW / visH;
        camera.updateProjectionMatrix();
    }
}

window.addEventListener('load', () => updateRendererViewport());

const scene = new THREE.Scene();

const params = {
    envPath: '/assets/env.png',
};

const defaultBackground = '#dddddd';
scene.background = new THREE.Color(defaultBackground);

const yawBase = Math.PI / 6;        
const yawHalfRange = Math.PI / 3;  
const clampYaw = (y) => Math.min(yawBase + yawHalfRange, Math.max(yawBase - yawHalfRange, y));

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

let currentEnvMap = null; 

function loadEnvironment(path) {
    const loader = new THREE.TextureLoader();
    loader.load(path, (texture) => {
        texture.encoding = THREE.sRGBEncoding;
        texture.mapping = THREE.EquirectangularReflectionMapping;

        const envMap = pmremGenerator.fromEquirectangular(texture).texture;

        if (currentEnvMap && currentEnvMap !== envMap) {
            currentEnvMap.dispose();
        }
        currentEnvMap = envMap;
        scene.environment = envMap;

 
    }, undefined, (err) => console.error('Error loading env texture:', err));
}

loadEnvironment(params.envPath);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 0.8, 2.5);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(3, 10, 10);

dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 50;
dir.shadow.camera.left = -5;
dir.shadow.camera.right = 5;
dir.shadow.camera.top = 5;
dir.shadow.camera.bottom = -5;
dir.shadow.bias = -0.0005;
scene.add(dir);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.ShadowMaterial({ opacity: 0.2 }) 
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

let model = null;
new GLTFLoader().load('/assets/chips.glb', (g) => {
    model = g.scene;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar((1 / maxDim) * 1.5);

    model.position.set(0, 0.5, 0.5);
    model.rotation.x = Math.PI / 9;
    model.rotation.y = yawBase;

    model.traverse((n) => {
        if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
        }
    });

    scene.add(model);
}, undefined, (err) => console.error('Error loading GLB:', err));

let dragging = false, px = 0, py = 0;
renderer.domElement.style.touchAction = 'none';

renderer.domElement.addEventListener('pointerdown', (e) => {
    dragging = true;
    px = e.clientX; py = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
    if (!dragging || !model) return;
    const dx = e.clientX - px;
    const rotateSpeed = 0.005;
    model.rotation.y = clampYaw(model.rotation.y + dx * rotateSpeed);
    px = e.clientX; py = e.clientY;
});

renderer.domElement.addEventListener('pointerup', (e) => {
    dragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
});
renderer.domElement.addEventListener('pointercancel', () => dragging = false);

window.addEventListener('resize', () => {
    updateRendererViewport();
});

(function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
})();