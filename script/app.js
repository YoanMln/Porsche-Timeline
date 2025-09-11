import * as THREE from "./lib/three.module.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { OrbitControls } from "./lib/OrbitControls.js";

// Sélectionne toutes les div .viewer
const viewers = document.querySelectorAll(".viewer");

viewers.forEach((viewer) => {
  const modelPath = viewer.dataset.model;

  // Création de la scène
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    viewer.clientWidth / viewer.clientHeight,
    0.1,
    1000
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  renderer.setClearColor(0x000000, 0);
  viewer.appendChild(renderer.domElement);

  // Lumières améliorées
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(5, 10, 7.5);
  const pointLight = new THREE.PointLight(0xffffff, 0.7);
  pointLight.position.set(0, 10, 10);

  scene.add(ambientLight);
  scene.add(directionalLight);
  scene.add(pointLight);

  // Variable pour l'animation
  let model = null;

  // Chargement du modèle
  const loader = new GLTFLoader();
  loader.load(
    modelPath,
    (gltf) => {
      model = gltf.scene;
      scene.add(model);

      console.log("Modèle chargé avec succès");
      console.log("Nombre d'enfants :", model.children.length);

      // Calculer la boîte englobante
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      console.log("Taille du modèle :", size);
      console.log("Centre du modèle :", center);

      // Centrer le modèle
      model.position.sub(center);

      // Agrandir le modèle
      model.scale.setScalar(1.5); // 150% de la taille originale

      // Positionner la caméra
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 2; // Marge de sécurité

      camera.position.set(0, 0, cameraZ);
      camera.lookAt(0, 0, 0);

      console.log("Position de la caméra :", camera.position);

      // Démarrer l'animation
      animate();
    },
    (xhr) => {
      console.log(
        `Chargement : ${Math.round((xhr.loaded / xhr.total) * 100)}%`
      );
    },
    (error) => {
      console.error("Erreur de chargement :", error);
    }
  );

  // Fonction d'animation
  function animate() {
    requestAnimationFrame(animate);

    controls.update();

    if (model) {
      model.rotation.y += 0.005;
    }

    renderer.render(scene, camera);
  }

  // Redimensionnement
  window.addEventListener("resize", () => {
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
});
