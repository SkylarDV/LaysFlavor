import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 0.8, 2.5);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(3, 10, 10);
scene.add(dir);

let model = null;
new GLTFLoader().load('/assets/chips.glb', (g) => {
    model = g.scene;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar((1 / maxDim) * 1.5);

    model.position.x = -1;
    model.rotation.y = Math.PI / 6;
    model.position.y += 0.15;
    scene.add(model);
});

let dragging = false, px = 0, py = 0;
const speed = 0.005;
renderer.domElement.style.touchAction = 'none';

renderer.domElement.addEventListener('pointerdown', (e) => {
    dragging = true;
    px = e.clientX; py = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
    if (!dragging || !model) return;
    const dx = e.clientX - px;
    model.rotation.y += dx * speed;
    px = e.clientX; py = e.clientY;
});

renderer.domElement.addEventListener('pointerup', (e) => {
    dragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
});
renderer.domElement.addEventListener('pointercancel', () => dragging = false);

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

(function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
})();