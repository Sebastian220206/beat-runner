// Beat Runner - Three.js 3D Musical Chase Renderer
// Integrates Playable Boy Beat (public/subway_surfers_characters.glb Object_18),
// Officer Tempo (Object_7 + Dog Object_4), 3D Trains (Object_17),
// 3D Musical Note Collectibles (C..B), State-Based Procedural Vertex Animation & Camera-Synced 2D HUD

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GameManager, TrackEntity } from './game.ts';
import { GenreTheme } from './genres.ts';
import { JudgmentResult } from './rhythm.ts';
import { storage } from './storage.ts';

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  color: string;
  opacity: number;
  scale: number;
  life: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
}

// 3D World Constants calibrated to public/subway_surfers.glb track geometry
const LANE_WIDTH = 2.25; // Exact spacing between the 3 railroad tracks in subway_surfers.glb
const UNITS_PER_BEAT = 11.5; // Forward scrolling speed per musical beat
const CORRIDOR_LOOP_LENGTH = 230.0; // Seamless loop length of the 4 modular track+city chunks

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  // Three.js 3D Scene & WebGL Layer
  private webglCanvas: HTMLCanvasElement | null = null;
  private webglRenderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private glbLoaded = false;
  private characterLoaded = false;

  // 3D Environment & Lighting References
  private corridorGroupA: THREE.Group | null = null;
  private corridorGroupB: THREE.Group | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private dirLight: THREE.DirectionalLight | null = null;
  private sceneFog: THREE.FogExp2 | null = null;

  // Beat (The Boy - Playable Character from subway_surfers_characters.glb Object_18) & State Animation Controller
  private playerGroup: THREE.Group | null = null;
  private beatMesh: THREE.Mesh | null = null;
  private beatRestPositions: Float32Array | null = null;
  private groundAuraMesh: THREE.Mesh | null = null;
  private boardGlowLight: THREE.PointLight | null = null;

  // Smooth State-Based Animation Blending Weights (0..1)
  private animRunWeight = 0;
  private animJumpWeight = 0;
  private animSlideWeight = 0;
  private animCollectWeight = 0;
  private animCollisionWeight = 0;
  private animGameOverWeight = 0;
  private smoothLaneBank = 0;
  private smoothLaneYaw = 0;
  private smoothSlidePitch = 0;
  private smoothRunCycle = 0;

  // Officer Tempo (The Police Officer & Dog) Dynamic Chaser & T-Pose-to-Run Deformer
  private officerGroup: THREE.Group | null = null;
  private officerMesh: THREE.Mesh | null = null;
  private officerRestPositions: Float32Array | null = null;
  private dogMesh: THREE.Mesh | null = null;

  // 3D Track Overlay Pools (Beat Lines, Strike Bar, 3D Musical Notes, Trains, Lasers, Signals, Portals)
  private beatLineMeshes: THREE.Mesh[] = [];
  private strikeBarMesh: THREE.Mesh | null = null;
  private targetRingMeshes: THREE.Mesh[] = [];
  private entityGroup: THREE.Group | null = null;
  private noteMeshes: THREE.Group[] = [];
  private barrierMeshes: THREE.Group[] = [];
  private laserMeshes: THREE.Group[] = [];
  private signalMeshes: THREE.Group[] = [];
  private pulseMeshes: THREE.Mesh[] = [];
  private portalMeshes: THREE.Mesh[] = [];

  // Shared 3D Materials updated per Genre
  private primaryMat: THREE.MeshStandardMaterial | null = null;
  private secondaryMat: THREE.MeshStandardMaterial | null = null;
  private noteFreeMat: THREE.MeshStandardMaterial | null = null;
  private noteSeqMat: THREE.MeshStandardMaterial | null = null;
  private noteChallengeMat: THREE.MeshStandardMaterial | null = null;
  private barrierMat: THREE.MeshStandardMaterial | null = null;
  private signalMat: THREE.MeshStandardMaterial | null = null;
  private pulseMat: THREE.MeshBasicMaterial | null = null;
  private boardPrimaryMat: THREE.MeshStandardMaterial | null = null;
  private boardSecondaryMat: THREE.MeshStandardMaterial | null = null;
  private lastGenreId = '';
  private lastSkinId = '';

  // Viewport metrics
  private width = 800;
  private height = 600;
  private horizonY = 240;
  private strikeY = 480;
  private vanishingX = 400;

  // Effects & Feedback
  private floatingTexts: FloatingText[] = [];
  private particles: Particle[] = [];
  private pulseShockwave = 0; // 0 to 1
  private lastTimingDeltaMs: number | null = null;
  private timingArcOpacity = 0;
  private tempVec = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = context;

    this.initThreeJS();
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  private initThreeJS(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    try {
      this.webglCanvas = document.createElement('canvas');
      this.webglCanvas.id = 'webgl-canvas';
      this.webglCanvas.style.position = 'absolute';
      this.webglCanvas.style.top = '0';
      this.webglCanvas.style.left = '0';
      this.webglCanvas.style.width = '100%';
      this.webglCanvas.style.height = '100%';
      this.webglCanvas.style.zIndex = '0';
      this.webglCanvas.style.pointerEvents = 'none';

      if (this.canvas.parentElement) {
        this.canvas.parentElement.insertBefore(this.webglCanvas, this.canvas);
      }

      this.webglRenderer = new THREE.WebGLRenderer({
        canvas: this.webglCanvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.webglRenderer.toneMappingExposure = 1.18;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#120824');
      this.sceneFog = new THREE.FogExp2('#120824', 0.0052);
      this.scene.fog = this.sceneFog;

      this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.5, 360);
      this.camera.position.set(0, 4.15, 7.6);
      this.camera.lookAt(0, 1.35, -16);

      // Vibrant Arcade Lighting
      this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x2a1b4e, 1.9);
      this.hemiLight.position.set(0, 40, 0);
      this.scene.add(this.hemiLight);

      this.dirLight = new THREE.DirectionalLight(0xfff4e6, 1.65);
      this.dirLight.position.set(18, 35, 24);
      this.scene.add(this.dirLight);

      this.init3DGameplayPools();
      this.loadSubwaySurfersGLB();
      this.loadPlayableCharacterGLB();
    } catch {
      this.webglRenderer = null;
    }
  }

  /**
   * Builds a 3D Sculpted Musical Eighth Note (♪) mesh group (tilted notehead + stem + flag + halo)
   */
  private create3DMusicalNoteGroup(noteMat: THREE.Material, haloMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();

    // 1. Tilted Notehead (♩)
    const headGeo = new THREE.SphereGeometry(0.32, 16, 12);
    headGeo.scale(1.25, 0.88, 0.9);
    headGeo.rotateZ(-0.35);
    const headMesh = new THREE.Mesh(headGeo, noteMat);
    headMesh.position.set(-0.08, -0.22, 0);

    // 2. Vertical Stem
    const stemGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.78, 10);
    const stemMesh = new THREE.Mesh(stemGeo, noteMat);
    stemMesh.position.set(0.18, 0.14, 0);

    // 3. Eighth-Note Flag (♪)
    const flagGeo = new THREE.BoxGeometry(0.34, 0.12, 0.07);
    flagGeo.rotateZ(-0.48);
    const flagMesh = new THREE.Mesh(flagGeo, noteMat);
    flagMesh.position.set(0.31, 0.42, 0);

    // 4. Outer Glowing Harmonic Halo
    const haloGeo = new THREE.TorusGeometry(0.76, 0.045, 10, 28);
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);

    const noteCore = new THREE.Group();
    noteCore.add(headMesh, stemMesh, flagMesh);
    g.add(noteCore, haloMesh);
    return g;
  }

  private init3DGameplayPools(): void {
    if (!this.scene) return;

    this.primaryMat = new THREE.MeshStandardMaterial({
      color: 0xff007f,
      emissive: 0xff007f,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.3,
    });

    this.secondaryMat = new THREE.MeshStandardMaterial({
      color: 0x00f3ff,
      emissive: 0x00f3ff,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.3,
    });

    this.noteFreeMat = new THREE.MeshStandardMaterial({
      color: 0x00f3ff,
      emissive: 0x00f3ff,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.4,
    });

    this.noteSeqMat = new THREE.MeshStandardMaterial({
      color: 0xffeb3b,
      emissive: 0xffaa00,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.5,
    });

    this.noteChallengeMat = new THREE.MeshStandardMaterial({
      color: 0xff2a85,
      emissive: 0xff2a85,
      emissiveIntensity: 0.95,
      roughness: 0.1,
      metalness: 0.6,
    });

    this.barrierMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xff1744,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.4,
    });

    this.signalMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.4,
    });

    this.pulseMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

    // 1. Glowing Strike Bar & 3 Lane Target Rings on the Railroad Tracks
    const strikeGeo = new THREE.BoxGeometry(LANE_WIDTH * 3.1, 0.05, 0.16);
    const strikeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.strikeBarMesh = new THREE.Mesh(strikeGeo, strikeMat);
    this.strikeBarMesh.position.set(0, 0.07, 0);
    this.scene.add(this.strikeBarMesh);

    const ringGeo = new THREE.RingGeometry(0.55, 0.72, 28);
    ringGeo.rotateX(-Math.PI / 2);
    for (let lane = 0; lane < 3; lane++) {
      const ringMesh = new THREE.Mesh(ringGeo, lane === 1 ? this.primaryMat : this.secondaryMat);
      ringMesh.position.set((lane - 1) * LANE_WIDTH, 0.08, 0);
      this.scene.add(ringMesh);
      this.targetRingMeshes.push(ringMesh);
    }

    // 2. Beat Grid Bars Pool (14 bars scrolling along the tracks)
    const beatGeo = new THREE.BoxGeometry(LANE_WIDTH * 3.05, 0.03, 0.1);
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(beatGeo, this.secondaryMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.beatLineMeshes.push(mesh);
    }

    // 3. Player Group ("Beat" the Playable Boy aligned flush with the railway tracks at y = 0.04)
    this.playerGroup = new THREE.Group();
    this.playerGroup.position.set(0, 0.04, 0);

    this.boardPrimaryMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x00f3ff,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.6,
    });
    this.boardSecondaryMat = new THREE.MeshStandardMaterial({
      color: 0x00f3ff,
      emissive: 0x00f3ff,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.7,
    });

    // Flush Ground-Level Musical Resonance Ring under Beat's feet (feet touch the railway tracks directly)
    const auraGeo = new THREE.RingGeometry(0.32, 0.48, 28);
    auraGeo.rotateX(-Math.PI / 2);
    this.groundAuraMesh = new THREE.Mesh(auraGeo, this.boardSecondaryMat);
    this.groundAuraMesh.position.set(0, 0.008, 0);
    this.playerGroup.add(this.groundAuraMesh);

    this.boardGlowLight = new THREE.PointLight(0x00f3ff, 3.2, 11);
    this.boardGlowLight.position.set(0, 0.95, 0.35);
    this.playerGroup.add(this.boardGlowLight);

    this.scene.add(this.playerGroup);

    // 4. Officer Tempo Group (Police Officer + Dog Chasing Behind Beat!)
    this.officerGroup = new THREE.Group();
    this.officerGroup.position.set(0, 0.05, 2.6);
    this.scene.add(this.officerGroup);

    // 5. Dynamic Track Entities Pool
    this.entityGroup = new THREE.Group();
    this.scene.add(this.entityGroup);

    // Pool of 32 3D Musical Note Collectibles (♪)
    for (let i = 0; i < 32; i++) {
      const g = this.create3DMusicalNoteGroup(this.noteFreeMat, this.secondaryMat);
      g.visible = false;
      this.entityGroup.add(g);
      this.noteMeshes.push(g);
    }

    // Pool of 12 Lane Train / Barrier Blockers (populated with 3D Train Cars once GLB loads)
    const fallbackBlockGeo = new THREE.BoxGeometry(1.85, 2.6, 4.2);
    const stripeGeo = new THREE.BoxGeometry(1.9, 0.4, 4.24);
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x090414 });
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const block = new THREE.Mesh(fallbackBlockGeo, this.barrierMat);
      block.position.y = 1.3;
      const stripe = new THREE.Mesh(stripeGeo, darkMat);
      stripe.position.y = 1.5;
      g.add(block, stripe);
      g.visible = false;
      this.entityGroup.add(g);
      this.barrierMeshes.push(g);
    }

    // Pool of 8 Low Jump Laser Hurdles (▲ JUMP ▲)
    const beamGeo = new THREE.CylinderGeometry(0.09, 0.09, LANE_WIDTH * 3.1, 12);
    beamGeo.rotateZ(Math.PI / 2);
    const postGeo = new THREE.BoxGeometry(0.28, 1.25, 0.28);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(beamGeo, this.barrierMat);
      beam.position.y = 0.72;
      const postL = new THREE.Mesh(postGeo, this.secondaryMat);
      postL.position.set(-LANE_WIDTH * 1.55, 0.62, 0);
      const postR = new THREE.Mesh(postGeo, this.secondaryMat);
      postR.position.set(LANE_WIDTH * 1.55, 0.62, 0);
      g.add(beam, postL, postR);
      g.visible = false;
      this.entityGroup.add(g);
      this.laserMeshes.push(g);
    }

    // Pool of 8 Overhead High Railway Signal Gates (▼ SLIDE ▼)
    const highBeamGeo = new THREE.BoxGeometry(LANE_WIDTH * 3.1, 0.65, 0.35);
    const highPostGeo = new THREE.BoxGeometry(0.28, 2.45, 0.28);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const overhead = new THREE.Mesh(highBeamGeo, this.signalMat);
      overhead.position.y = 1.75; // Clears sliding player (height < 1.1), blocks standing player
      const postL = new THREE.Mesh(highPostGeo, this.secondaryMat);
      postL.position.set(-LANE_WIDTH * 1.55, 1.22, 0);
      const postR = new THREE.Mesh(highPostGeo, this.secondaryMat);
      postR.position.set(LANE_WIDTH * 1.55, 1.22, 0);
      g.add(overhead, postL, postR);
      g.visible = false;
      this.entityGroup.add(g);
      this.signalMeshes.push(g);
    }

    // Pool of 10 Pulse Rings
    const pulseGeo = new THREE.TorusGeometry(1.15, 0.09, 12, 32);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(pulseGeo, this.pulseMat);
      m.visible = false;
      this.entityGroup.add(m);
      this.pulseMeshes.push(m);
    }

    // Pool of 3 Genre Portals
    const portalGeo = new THREE.TorusGeometry(3.4, 0.18, 16, 48);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(portalGeo, this.primaryMat);
      m.visible = false;
      this.entityGroup.add(m);
      this.portalMeshes.push(m);
    }
  }

  /**
   * Filters a BufferGeometry to keep only triangles whose 3 vertices satisfy `predicate(x, y, z)`.
   */
  private extractFilteredSubGeometry(
    sourceGeom: THREE.BufferGeometry,
    predicate: (x: number, y: number, z: number) => boolean
  ): THREE.BufferGeometry {
    const cloned = sourceGeom.clone();
    const pos = cloned.getAttribute('position');
    const index = cloned.getIndex();

    if (index) {
      const oldIndices = index.array;
      const newIndices: number[] = [];
      for (let i = 0; i < oldIndices.length; i += 3) {
        const i0 = oldIndices[i];
        const i1 = oldIndices[i + 1];
        const i2 = oldIndices[i + 2];
        if (
          predicate(pos.getX(i0), pos.getY(i0), pos.getZ(i0)) &&
          predicate(pos.getX(i1), pos.getY(i1), pos.getZ(i1)) &&
          predicate(pos.getX(i2), pos.getY(i2), pos.getZ(i2))
        ) {
          newIndices.push(i0, i1, i2);
        }
      }
      cloned.setIndex(newIndices);
    }
    return cloned;
  }

  /**
   * Loads public/subway_surfers.glb and extracts:
   * - Modular 3-lane track + buildings + overhead arches chunks (Object_12, Object_13, Object_14, Object_15)
   * - Distant city skyline backdrop (Object_11)
   * - Officer Tempo (The Police Officer: Object_7 / Mesh 5) + Police Dog (Object_4 / Mesh 2) with T-pose-to-run deformer
   * - 3D Subway Train Car (Object_17 / Mesh 15) for lane train obstacles
   */
  private loadSubwaySurfersGLB(): void {
    if (!this.scene) return;

    const loader = new GLTFLoader();
    loader.load(
      './subway_surfers.glb',
      (gltf) => {
        if (!this.scene) return;

        // Cyclic permutation matrix (det = +1) mapping raw GLB (X, Y, Z) -> Three.js World (Y - offsetY, Z - offsetZ, X - offsetX)
        const createCoordTransform = (
          offsetX: number,
          offsetY: number,
          offsetZ: number
        ): THREE.Matrix4 => {
          return new THREE.Matrix4().set(
            0, 1, 0, -offsetY,
            0, 0, 1, -offsetZ,
            1, 0, 0, -offsetX,
            0, 0, 0, 1
          );
        };

        const corridorTransform = createCoordTransform(-58.0, 23.75, 0.0);
        const corridorChunkNames = new Set(['Object_12', 'Object_13', 'Object_14', 'Object_15']);

        this.corridorGroupA = new THREE.Group();
        this.corridorGroupB = new THREE.Group();

        gltf.scene.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;

          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat) {
            if (mat.map) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.anisotropy = 4;
            }
            mat.roughness = 0.68;
            mat.metalness = 0.05;
            mat.needsUpdate = true;
          }

          if (corridorChunkNames.has(child.name)) {
            const geom = child.geometry.clone();
            geom.applyMatrix4(corridorTransform);

            const meshA = new THREE.Mesh(geom, mat);
            const meshB = new THREE.Mesh(geom, mat);
            this.corridorGroupA?.add(meshA);
            this.corridorGroupB?.add(meshB);
          } else if (child.name === 'Object_11') {
            // Distant City Skyline Horizon Backdrop
            const skyGeom = child.geometry.clone();
            skyGeom.applyMatrix4(corridorTransform);
            const skyMesh = new THREE.Mesh(skyGeom, mat);
            this.scene?.add(skyMesh);
          } else if (child.name === 'Object_7' && this.officerGroup) {
            // OFFICER TEMPO (The Police Officer): Orient facing -Z and store rest vertices for T-pose-to-Run deformer
            const officerGeom = child.geometry.clone();
            const officerTransform = createCoordTransform(-55.08, 23.67, 0.13);
            officerGeom.applyMatrix4(officerTransform);

            const posAttr = officerGeom.getAttribute('position') as THREE.BufferAttribute;
            this.officerRestPositions = new Float32Array(posAttr.array);

            this.officerMesh = new THREE.Mesh(officerGeom, mat);
            this.officerMesh.scale.setScalar(0.88);
            this.officerMesh.position.set(0, 0, 0);
            this.officerGroup.add(this.officerMesh);
          } else if (child.name === 'Object_4' && this.officerGroup) {
            // OFFICER TEMPO'S DOG: Trots alongside Officer Tempo
            const dogGeom = child.geometry.clone();
            const dogTransform = createCoordTransform(-60.9, 22.8, 0.01);
            dogGeom.applyMatrix4(dogTransform);

            this.dogMesh = new THREE.Mesh(dogGeom, mat);
            this.dogMesh.scale.setScalar(0.88);
            this.dogMesh.position.set(0.85, 0, 0.25);
            this.officerGroup.add(this.dogMesh);
          } else if (child.name === 'Object_17') {
            // Extract a single 3D Painted Subway Train Car (rawX > -80, rawY > 24.85) for lane train obstacles
            const trainGeom = this.extractFilteredSubGeometry(
              child.geometry,
              (x, y) => x > -80 && y > 24.85
            );
            const trainTransform = createCoordTransform(-76.19, 25.88, 0.13);
            trainGeom.applyMatrix4(trainTransform);

            for (const barrierGroup of this.barrierMeshes) {
              barrierGroup.clear();
              const trainCar = new THREE.Mesh(trainGeom, mat);
              trainCar.scale.set(0.95, 0.95, 0.78);
              barrierGroup.add(trainCar);
            }
          }
        });

        this.scene.add(this.corridorGroupA);
        this.scene.add(this.corridorGroupB);
        this.glbLoaded = true;
      },
      undefined,
      (err) => {
        console.warn('Subway Surfers GLB fallback to procedural highway:', err);
      }
    );
  }

  /**
   * Loads public/subway_surfers_characters.glb and integrates the playable boy character ("Beat"):
   * - Inspects the 17-mesh character lineup and selects Object_18 (Mesh 16), the young boy at the origin.
   * - Filters rawX in [-0.8, 0.8] (3,254 vertices) to exclude adjacent character shoe geometry at X = -1.6.
   * - Applies a determinant +1 upright forward transform so his sneaker soles sit flush at y = 0.0 facing -Z.
   * - Preserves the original Material_4 diffuse texture (Image 8, 256x256) and attaches Beat's glowing headphones.
   */
  private loadPlayableCharacterGLB(): void {
    if (!this.scene || this.characterLoaded) return;

    const loader = new GLTFLoader();
    loader.load(
      './subway_surfers_characters.glb',
      (gltf) => {
        if (!this.playerGroup || this.characterLoaded) return;

        gltf.scene.traverse((child) => {
          if (!(child instanceof THREE.Mesh) || child.name !== 'Object_18') return;

          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat) {
            if (mat.map) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.anisotropy = 4;
            }
            mat.roughness = 0.56;
            mat.metalness = 0.05;
            mat.needsUpdate = true;
          }

          // Extract only the playable boy at the origin (rawX in [-0.8, 0.8]), excluding adjacent shoes
          const beatGeom = this.extractFilteredSubGeometry(
            child.geometry,
            (x) => x >= -0.8 && x <= 0.8
          );

          // Determinant +1 rotation + pivot alignment:
          // Maps raw (X, Y, Z) -> (-rawX, rawZ + 0.128, rawY + 0.04)
          // Sneaker soles (rawZ = -0.128) sit flush at localY = 0.000, facing -Z (down the railway tracks)
          const beatTransform = new THREE.Matrix4().set(
            -1, 0, 0, 0,
             0, 0, 1, 0.128,
             0, 1, 0, 0.04,
             0, 0, 0, 1
          );
          beatGeom.applyMatrix4(beatTransform);
          beatGeom.computeVertexNormals();

          const posAttr = beatGeom.getAttribute('position') as THREE.BufferAttribute;
          this.beatRestPositions = new Float32Array(posAttr.array);

          // Remove any previous beatMesh cleanly before attaching
          if (this.beatMesh) {
            this.playerGroup?.remove(this.beatMesh);
            this.beatMesh.geometry.dispose();
          }

          this.beatMesh = new THREE.Mesh(beatGeom, mat);
          this.beatMesh.scale.setScalar(1.22); // World height ~1.91 units matching the 3-lane railway tracks
          this.beatMesh.position.set(0, 0, 0); // Sneaker soles sit directly on the railway surface!
          this.playerGroup?.add(this.beatMesh);

          // Attach Beat's Signature Magical Glowing Headphones around his hood/head
          const earGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.07, 12);
          earGeo.rotateZ(Math.PI / 2);
          const earL = new THREE.Mesh(earGeo, this.secondaryMat!);
          earL.position.set(-0.20, 1.29, -0.02);
          const earR = new THREE.Mesh(earGeo, this.secondaryMat!);
          earR.position.set(0.20, 1.29, -0.02);
          this.beatMesh.add(earL, earR);

          this.characterLoaded = true;
        });
      },
      undefined,
      (err) => {
        console.warn('Could not load subway_surfers_characters.glb:', err);
      }
    );
  }

  /**
   * State-based procedural vertex animation controller for Beat (subway_surfers_characters.glb Object_18):
   * Since subway_surfers_characters.glb has 0 embedded animation clips and 0 skeletons, this controller
   * smoothly blends T-pose rest vertices across all 8 required gameplay states without abrupt snapping:
   * - IDLE: Natural relaxed arm fold, subtle breathing sway, and rhythmic bounce to the music.
   * - RUNNING: Speed-matched alternating thigh/knee stride + opposite-phase bent-elbow arm swing.
   * - JUMPING: Takeoff anticipation, tucked-knee airborne musical leap, raised arms, and landing compression.
   * - SLIDING: Smooth transition into an athletic crouched leg-extension slide and recovery to running.
   * - LANE_SWITCH: Smooth body lean & yaw rotation toward the target lane.
   * - COLLECTING_NOTE: Additive right-hand upward/forward musical catch gesture without interrupting running.
   * - COLLISION: Procedural stumble/flail reaction on obstacle impact.
   * - GAME_OVER: Stops running cycle and transitions into a slumped defeat posture.
   */
  private animateBeatVertices(game: GameManager, activeBeat: number, dt: number): void {
    if (!this.beatMesh || !this.beatRestPositions) return;

    // 1. Update Smooth State Blend Weights (0..1) using frame-rate-independent damping
    const isPlaying = game.state === 'PLAYING';
    const isGameOver = game.state === 'GAME_OVER';

    const targetRun = isPlaying ? 1.0 : 0.0;
    const targetJump = isPlaying && game.isJumping ? 1.0 : 0.0;
    const targetSlide = isPlaying && game.isSliding ? 1.0 : 0.0;
    const targetCollect = game.noteGestureTimer > 0 ? 1.0 : 0.0;
    const targetCollision = game.stumbleTimer > 0 ? 1.0 : 0.0;
    const targetGameOver = isGameOver ? 1.0 : 0.0;

    const blendFast = Math.min(1, dt * 14);
    const blendMed = Math.min(1, dt * 10);

    this.animRunWeight = THREE.MathUtils.lerp(this.animRunWeight, targetRun, blendMed);
    this.animJumpWeight = THREE.MathUtils.lerp(this.animJumpWeight, targetJump, blendFast);
    this.animSlideWeight = THREE.MathUtils.lerp(this.animSlideWeight, targetSlide, blendFast);
    this.animCollectWeight = THREE.MathUtils.lerp(this.animCollectWeight, targetCollect, blendFast);
    this.animCollisionWeight = THREE.MathUtils.lerp(this.animCollisionWeight, targetCollision, blendFast);
    this.animGameOverWeight = THREE.MathUtils.lerp(this.animGameOverWeight, targetGameOver, blendMed);

    // Sync running cycle directly to the musical beat clock (scales automatically with genre BPM)
    this.smoothRunCycle = activeBeat * Math.PI * 2;

    const posAttr = this.beatMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const rest = this.beatRestPositions;

    const strideSin = Math.sin(this.smoothRunCycle);
    const strideCos = Math.cos(this.smoothRunCycle);
    const idlePulse = Math.sin(activeBeat * Math.PI * 2);

    // Effective running stride weight (reduced while mid-air jumping, sliding, or defeated)
    const activeStrideWeight =
      this.animRunWeight *
      (1 - this.animJumpWeight * 0.78) *
      (1 - this.animSlideWeight * 0.85) *
      (1 - this.animGameOverWeight);

    // Additive note-collection gesture wave
    const collectWave =
      this.animCollectWeight * Math.sin(Math.min(1, game.noteGestureTimer / 0.34) * Math.PI);
    const stumbleShake = this.animCollisionWeight * Math.sin(performance.now() * 0.045);

    for (let i = 0; i < arr.length; i += 3) {
      const rx = rest[i];
      const ry = rest[i + 1];
      const rz = rest[i + 2];

      let nx = rx;
      let ny = ry;
      let nz = rz;

      // A. LEGS & FEET (ry < 0.72, hip pivot at ry = 0.72, knee pivot at ry = 0.40)
      if (ry < 0.72) {
        const isLeftLeg = rx < 0;
        const legSign = isLeftLeg ? 1 : -1;
        const distFromHip = 0.72 - ry;

        // Running hip swing + jump pose + slide forward leg extension
        const runHipAngle = legSign * strideSin * 0.64 * activeStrideWeight;
        const jumpHipAngle = (isLeftLeg ? 0.52 : -0.38) * this.animJumpWeight;
        const slideHipAngle = (isLeftLeg ? 0.72 : 0.48) * this.animSlideWeight;
        const totalHipAngle = runHipAngle + jumpHipAngle + slideHipAngle;

        nz = rz - Math.sin(totalHipAngle) * distFromHip;
        ny = ry + (1 - Math.cos(totalHipAngle)) * distFromHip * 0.38;

        // Knee bend below ry = 0.40 during stride recovery, jump tuck, and slide crouch
        if (ry < 0.40) {
          const distFromKnee = 0.40 - ry;
          const runKneeBend =
            Math.max(0, legSign * strideCos) * 0.68 * activeStrideWeight;
          const jumpKneeBend = 0.75 * this.animJumpWeight;
          const slideKneeBend = (isLeftLeg ? 0.25 : 0.85) * this.animSlideWeight;
          const totalKneeBend = runKneeBend + jumpKneeBend + slideKneeBend;

          nz += Math.sin(totalKneeBend) * distFromKnee * 0.85;
          ny += Math.sin(totalKneeBend) * distFromKnee * 0.42;
        }
      }
      // B. T-POSE ARMS & HANDS (|rx| > 0.185 and ry in [0.88, 1.18])
      else if (Math.abs(rx) > 0.185 && ry >= 0.88 && ry <= 1.18) {
        const signX = rx < 0 ? -1 : 1; // -1 = Left Arm, +1 = Right Arm
        const shoulderX = signX * 0.185;
        const shoulderY = 1.06;
        const armDist = Math.abs(rx) - 0.185; // 0 at shoulder -> 0.53 at fingertips
        const dy = ry - shoulderY;

        // Fold T-pose arms down ~1.16 rad (66 deg) to Beat's sides; raise slightly on jump, collision, or note catch
        let foldAngle =
          1.16 -
          this.animJumpWeight * 0.48 -
          this.animSlideWeight * 0.28 -
          this.animCollisionWeight * 0.55 +
          this.animGameOverWeight * 0.15;

        // Right arm (+X) performs an energetic upward musical catch gesture when collecting notes!
        if (signX > 0 && collectWave > 0.01) {
          foldAngle -= collectWave * 0.68;
        }

        // Subtle idle rhythmic arm sway in MENU
        if (this.animRunWeight < 0.5) {
          foldAngle -= (1 - this.animRunWeight) * (0.08 + signX * idlePulse * 0.06);
        }

        const cosF = Math.cos(foldAngle);
        const sinF = Math.sin(foldAngle);

        const foldedDist = armDist * cosF + dy * sinF;
        ny = shoulderY - armDist * sinF + dy * cosF;
        nx = shoulderX + signX * foldedDist;

        // Natural forward elbow bend (forearm & hand: armDist > 0.18)
        const forearmDist = Math.max(0, armDist - 0.18);
        const elbowForward =
          forearmDist *
          (0.45 + 0.35 * activeStrideWeight + (signX > 0 ? collectWave * 0.55 : 0));

        // Opposite-phase running arm pump + slide backward sweep + collision flail
        const runArmSwing = -signX * strideSin * 0.52 * activeStrideWeight;
        const slideArmSweep = -0.35 * this.animSlideWeight;
        const collisionFlail = signX * stumbleShake * 0.35;

        nz =
          rz -
          elbowForward -
          (runArmSwing + slideArmSweep + collisionFlail) * armDist -
          (signX > 0 ? collectWave * armDist * 0.45 : 0);
      }
      // C. HEAD, TORSO & CAP (ry >= 0.72 and within torso/head width)
      else if (ry >= 0.72) {
        const upperFactor = Math.max(0, (ry - 0.72) / 0.84);
        // Subtle rhythmic torso/head nod to the beat + collision jolt + game over slump
        const beatNod = Math.sin(activeBeat * Math.PI * 2) * 0.025 * upperFactor;
        const slumpForward = this.animGameOverWeight * 0.22 * upperFactor;
        const collisionJolt = stumbleShake * 0.08 * upperFactor;

        nz = rz - beatNod - slumpForward + collisionJolt;
        nx = rx + collisionJolt * 0.6;
        ny = ry - this.animGameOverWeight * 0.08 * upperFactor;
      }

      arr[i] = nx;
      arr[i + 1] = ny;
      arr[i + 2] = nz;
    }

    posAttr.needsUpdate = true;
  }

  /**
   * Real-time T-Pose-to-Running Vertex Deformer for Officer Tempo (Object_7):
   * - Folds his horizontal T-pose arms (|rx| > 0.46, ry in [1.1, 1.88]) down 64° around his shoulders
   * - Bends his forearms forward and swings his arms & legs in a heavy comedic police chase
   * - Supports 'lunging' (reaching forward for Beat), 'frustrated', and 'dancing' states!
   */
  private animateOfficerVertices(game: GameManager, activeBeat: number): void {
    if (!this.officerMesh || !this.officerRestPositions) return;

    const posAttr = this.officerMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const rest = this.officerRestPositions;

    const tempoPhase = activeBeat * Math.PI * 2 + 0.7;
    const swingSin = Math.sin(tempoPhase);
    const swingCos = Math.cos(tempoPhase);
    const state = game.tempoState;

    for (let i = 0; i < arr.length; i += 3) {
      const rx = rest[i];
      const ry = rest[i + 1];
      const rz = rest[i + 2];

      let nx = rx;
      let ny = ry;
      let nz = rz;

      // 1. Fold Officer Tempo's Outstretched T-Pose Arms (|rx| > 0.45, ry in [1.08, 1.92])
      if (Math.abs(rx) > 0.45 && ry >= 1.08 && ry <= 1.92) {
        const signX = rx < 0 ? -1 : 1;
        const shoulderX = signX * 0.45;
        const shoulderY = 1.52;
        const armDist = Math.abs(rx) - 0.45;
        const dy = ry - shoulderY;

        // Fold angle down from horizontal T-pose (~1.12 rad = 64 degrees down)
        let foldDownAngle = 1.12;
        if (state === 'frustrated') {
          // Throws arms up in frustration!
          foldDownAngle = 0.35 + Math.sin(activeBeat * 14) * 0.25;
        } else if (state === 'dancing') {
          // Comedic stiff disco arm wave!
          foldDownAngle = 0.75 + signX * Math.sin(activeBeat * Math.PI * 2) * 0.45;
        }

        const cosA = Math.cos(foldDownAngle);
        const sinA = Math.sin(foldDownAngle);

        // Rotate arm downward toward sides
        const foldedDist = armDist * cosA + dy * sinA;
        ny = shoulderY - armDist * sinA + dy * cosA;
        nx = shoulderX + signX * foldedDist;

        // Bend elbow forward (-Z) and pump arms with running stride
        let forwardReach = Math.max(0, armDist - 0.22) * 0.72;
        let pumpAngle = signX * swingSin * 0.48;

        if (state === 'lunging' && signX > 0) {
          // Officer Tempo lunges his right arm straight forward trying to grab Beat!
          forwardReach = armDist * 1.15;
          ny += armDist * 0.42;
          pumpAngle = 0.45;
        }

        nz = rz - forwardReach - pumpAngle * armDist;
      }
      // 2. Officer Tempo's Heavy Running Legs (ry < 0.96)
      else if (ry < 0.96) {
        const signX = rx < 0 ? -1 : 1;
        const distFromHip = 0.96 - ry;
        const legSwing = -signX * swingSin * 0.55;
        nz = rz - Math.sin(legSwing) * distFromHip;
        const footLift = Math.max(0, -signX * swingCos) * 0.14 * (distFromHip / 0.96);
        ny = ry + footLift;
      }

      arr[i] = nx;
      arr[i + 1] = ny;
      arr[i + 2] = nz;
    }

    posAttr.needsUpdate = true;
  }

  public handleResize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || window.innerWidth;
    this.height = rect.height || window.innerHeight;

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.vanishingX = this.width / 2;
    const isPortrait = this.height > this.width;
    this.horizonY = isPortrait ? this.height * 0.35 : this.height * 0.4;
    this.strikeY = isPortrait ? this.height * 0.78 : this.height * 0.75;

    if (this.webglRenderer && this.camera) {
      this.webglRenderer.setPixelRatio(this.dpr);
      this.webglRenderer.setSize(this.width, this.height, false);
      this.camera.aspect = this.width / Math.max(1, this.height);
      if (isPortrait) {
        this.camera.fov = 68;
        this.camera.position.set(0, 4.55, 8.6);
        this.camera.lookAt(0, 1.25, -16);
      } else {
        this.camera.fov = 58;
        this.camera.position.set(0, 4.15, 7.6);
        this.camera.lookAt(0, 1.35, -18);
      }
      this.camera.updateProjectionMatrix();
    }
  }

  public addJudgmentPopup(result: JudgmentResult, laneIndex: number): void {
    this.lastTimingDeltaMs = result.deltaMs;
    this.timingArcOpacity = 1.0;

    const p = this.project3D(laneIndex - 1, 0, 0.55);
    const screenX = p.visible ? p.x : this.vanishingX + (laneIndex - 1) * (this.width * 0.22);
    const screenY = p.visible ? p.y : this.strikeY - 45;

    const color =
      result.rating === 'PERFECT'
        ? '#00ffff'
        : result.rating === 'GREAT'
        ? '#ffeb3b'
        : result.rating === 'GOOD'
        ? '#ff9800'
        : '#ff1744';

    this.floatingTexts.push({
      text: result.label,
      x: screenX,
      y: screenY - 22,
      color,
      opacity: 1.0,
      scale: result.rating === 'PERFECT' ? 1.35 : 1.1,
      life: 0.95,
    });

    if (result.rating !== 'MISS') {
      const count = result.rating === 'PERFECT' ? 18 : 10;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 120;
        this.particles.push({
          x: screenX,
          y: screenY + 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          size: 2 + Math.random() * 4,
          color,
          alpha: 1.0,
          life: 0.4 + Math.random() * 0.3,
        });
      }
    }
  }

  public triggerShockwave(): void {
    this.pulseShockwave = 1.0;
  }

  /**
   * Projects (laneNormalized, beatsAhead, heightOffset) to 2D screen coordinates.
   */
  private project3D(
    laneNormalized: number,
    beatsAhead: number,
    heightOffset = 0
  ): { x: number; y: number; scale: number; visible: boolean } {
    if (beatsAhead < -2.5 || beatsAhead > 14) {
      return { x: 0, y: 0, scale: 0, visible: false };
    }

    if (this.glbLoaded && this.camera) {
      const worldX = laneNormalized * LANE_WIDTH;
      const worldY = heightOffset * 2.4;
      const worldZ = -beatsAhead * UNITS_PER_BEAT;

      this.tempVec.set(worldX, worldY, worldZ);
      this.tempVec.project(this.camera);

      if (this.tempVec.z > 1.0) {
        return { x: 0, y: 0, scale: 0, visible: false };
      }

      const screenX = (this.tempVec.x * 0.5 + 0.5) * this.width;
      const screenY = (-this.tempVec.y * 0.5 + 0.5) * this.height;
      const depth = Math.max(0, beatsAhead);
      const scale = 3.6 / (3.6 + depth);

      return { x: screenX, y: screenY, scale, visible: true };
    }

    const depth = Math.max(0, beatsAhead);
    const perspectiveFactor = 3.6 / (3.6 + depth);

    const screenY = this.horizonY + (this.strikeY - this.horizonY) * perspectiveFactor;
    const highwayHalfWidthAtBottom = Math.min(this.width * 0.44, 340);
    const laneSpread = highwayHalfWidthAtBottom * 0.62;

    const screenX = this.vanishingX + laneNormalized * laneSpread * perspectiveFactor;
    const finalY = screenY - heightOffset * perspectiveFactor * 120;

    return {
      x: screenX,
      y: finalY,
      scale: perspectiveFactor,
      visible: true,
    };
  }

  public render(game: GameManager, currentBeat: number, dt: number): void {
    const genre = game.currentGenre;
    const activeBeat =
      game.state === 'MENU' ? performance.now() * 0.001 * (genre.bpm / 60) * 0.65 : currentBeat;

    if (this.glbLoaded && this.webglRenderer && this.scene && this.camera) {
      this.ctx.clearRect(0, 0, this.width, this.height);

      this.updateThreeScene(game, genre, activeBeat, dt);
      this.webglRenderer.render(this.scene, this.camera);

      this.renderDiegeticOverlay(game, genre, activeBeat, dt);
    } else {
      this.renderSky(genre, activeBeat);
      this.renderHorizonSun(genre, activeBeat);
      this.renderSideEqualizers(genre, activeBeat);
      this.renderHighway(genre, activeBeat, dt);
      if (game.state === 'PLAYING' || game.state === 'PAUSED') {
        this.renderEntities(game.entities, activeBeat, genre);
      }
      this.renderPlayer(game, genre);
    }

    this.renderParticlesAndFX(dt, genre);
    this.renderFloatingText(dt);

    if (game.isFever && game.state === 'PLAYING') {
      this.renderFeverAura(genre);
    }
  }

  private updateThreeScene(
    game: GameManager,
    genre: GenreTheme,
    activeBeat: number,
    dt: number
  ): void {
    if (!this.scene || !this.camera) return;

    // 1. Sync Genre Theme Colors to 3D Lights, Fog & Materials
    if (this.lastGenreId !== genre.id) {
      this.lastGenreId = genre.id;
      const skyColor = new THREE.Color(genre.colors.skyBottom);
      const primaryColor = new THREE.Color(genre.colors.primary);
      const secondaryColor = new THREE.Color(genre.colors.secondary);
      const noteColor = new THREE.Color(genre.colors.note);
      const barrierColor = new THREE.Color(genre.colors.barrier);
      const pulseColor = new THREE.Color(genre.colors.pulseRing);

      this.scene.background = skyColor;
      if (this.sceneFog) {
        this.sceneFog.color.copy(skyColor);
      }
      if (this.hemiLight) {
        this.hemiLight.color.copy(secondaryColor).lerp(new THREE.Color(0xffffff), 0.65);
        this.hemiLight.groundColor.copy(new THREE.Color(genre.colors.highway));
      }
      if (this.primaryMat) {
        this.primaryMat.color.copy(primaryColor);
        this.primaryMat.emissive.copy(primaryColor);
      }
      if (this.secondaryMat) {
        this.secondaryMat.color.copy(secondaryColor);
        this.secondaryMat.emissive.copy(secondaryColor);
      }
      if (this.noteFreeMat) {
        this.noteFreeMat.color.copy(noteColor);
        this.noteFreeMat.emissive.copy(noteColor);
      }
      if (this.barrierMat) {
        this.barrierMat.color.copy(barrierColor);
        this.barrierMat.emissive.copy(barrierColor);
      }
      if (this.pulseMat) {
        this.pulseMat.color.copy(pulseColor);
      }
    }

    // 2. Sync Equipped Soundboard Aura Skin
    const skin = storage.getEquippedSkin();
    if (this.lastSkinId !== skin.id) {
      this.lastSkinId = skin.id;
      if (this.boardPrimaryMat) {
        this.boardPrimaryMat.color.set(skin.primaryColor);
        this.boardPrimaryMat.emissive.set(skin.glowColor);
      }
      if (this.boardSecondaryMat) {
        this.boardSecondaryMat.color.set(skin.secondaryColor);
        this.boardSecondaryMat.emissive.set(skin.secondaryColor);
      }
      if (this.boardGlowLight) {
        this.boardGlowLight.color.set(skin.glowColor);
      }
    }

    // 3. Scroll the 2 Tiled 3D Subway Surfers Track & City Corridors Seamlessly
    const scrollZ =
      (((activeBeat * UNITS_PER_BEAT) % CORRIDOR_LOOP_LENGTH) + CORRIDOR_LOOP_LENGTH) %
      CORRIDOR_LOOP_LENGTH;
    if (this.corridorGroupA && this.corridorGroupB) {
      this.corridorGroupA.position.z = scrollZ;
      this.corridorGroupB.position.z = scrollZ - CORRIDOR_LOOP_LENGTH;
    }

    // 4. Update 3D Beat Lines on the Railroad Tracks
    const startBeatInt = Math.floor(activeBeat);
    for (let i = 0; i < this.beatLineMeshes.length; i++) {
      const mesh = this.beatLineMeshes[i];
      const b = startBeatInt + i;
      const beatsAhead = b - activeBeat;
      if (beatsAhead < 0 || beatsAhead > 13) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(0, 0.05, -beatsAhead * UNITS_PER_BEAT);
      const isMeasure = b % 4 === 0;
      mesh.material = isMeasure ? this.primaryMat! : this.secondaryMat!;
      mesh.scale.set(1, 1, isMeasure ? 1.8 : 0.9);
    }

    const beatPulse = 1.0 + Math.sin((activeBeat % 1) * Math.PI) * 0.14;
    for (const ring of this.targetRingMeshes) {
      ring.scale.setScalar(beatPulse);
    }
    if (this.groundAuraMesh) {
      this.groundAuraMesh.scale.setScalar(beatPulse);
    }

    // 5. Update Beat (The Boy from subway_surfers_characters.glb) Position & State-Blended Animations
    this.animateBeatVertices(game, activeBeat, dt);

    let currentX = game.currentLaneX;
    const laneDelta = game.targetLane - 1 - game.currentLaneX;

    // Smoothly blend lane-switching body lean (Z) & yaw (Y) so there is never abrupt snapping
    const targetBank = game.state === 'PLAYING' ? laneDelta * -0.32 : 0;
    const targetYaw = game.state === 'PLAYING' ? laneDelta * -0.24 : 0;
    this.smoothLaneBank = THREE.MathUtils.lerp(
      this.smoothLaneBank,
      targetBank,
      Math.min(1, dt * 16)
    );
    this.smoothLaneYaw = THREE.MathUtils.lerp(
      this.smoothLaneYaw,
      targetYaw,
      Math.min(1, dt * 14)
    );

    const jumpHeight = game.isJumping
      ? Math.sin(game.jumpProgress * Math.PI) * (game.isDoubleJump ? 2.85 : 2.15)
      : 0;
    const runBob =
      Math.abs(Math.sin(this.smoothRunCycle * 0.5)) *
      0.065 *
      this.animRunWeight *
      (1 - this.animJumpWeight) *
      (1 - this.animSlideWeight);
    const idleBounce =
      (1 - this.animRunWeight) *
      (1 - this.animGameOverWeight) *
      Math.abs(Math.sin(activeBeat * Math.PI)) *
      0.035;

    if (game.state === 'MENU') {
      currentX = 0;
    }

    if (this.playerGroup) {
      // Sneaker soles sit flush on the railway surface (y = 0.04) with zero floating or sinking
      this.playerGroup.position.set(
        currentX * LANE_WIDTH,
        0.04 + jumpHeight + runBob + idleBounce,
        0
      );
      this.playerGroup.rotation.z = this.smoothLaneBank;

      // Smoothly blend vertical crouch scale & pitch across Slide, Jump, Collision, and Game Over
      const scaleY =
        1.0 - this.animSlideWeight * 0.44 - this.animGameOverWeight * 0.14;
      const scaleXZ = 1.0 + this.animSlideWeight * 0.08;
      this.playerGroup.scale.set(scaleXZ, scaleY, scaleXZ);

      const jumpPitch = game.isJumping ? Math.cos(game.jumpProgress * Math.PI) * 0.16 : 0;
      const targetPitch =
        -this.animSlideWeight * 0.36 +
        jumpPitch * this.animJumpWeight +
        this.animCollisionWeight * 0.32 +
        this.animGameOverWeight * 0.18;
      this.smoothSlidePitch = THREE.MathUtils.lerp(
        this.smoothSlidePitch,
        targetPitch,
        Math.min(1, dt * 15)
      );
      this.playerGroup.rotation.x = this.smoothSlidePitch;

      // Celebratory musical spin on Double Jump or Sequence Completion, or smooth lane yaw
      if (game.isDoubleJump) {
        this.playerGroup.rotation.y = game.jumpProgress * Math.PI * 2;
      } else if (game.celebrateTimer > 0) {
        this.playerGroup.rotation.y =
          this.smoothLaneYaw + Math.sin((game.celebrateTimer / 0.42) * Math.PI * 2) * 0.42;
      } else if (game.state === 'MENU') {
        // In Lobby, Beat faces the camera slightly so the player sees his smile & rhythmic bounce
        this.playerGroup.rotation.y = Math.PI * 0.85 + Math.sin(activeBeat * 0.5) * 0.14;
      } else {
        this.playerGroup.rotation.y = this.smoothLaneYaw;
      }
    }

    // 6. Update Officer Tempo & His Dog (Dynamic Chase Behind Beat!)
    this.animateOfficerVertices(game, activeBeat);
    if (this.officerGroup) {
      const tempoBob = Math.abs(Math.sin((activeBeat + 0.35) * Math.PI)) * 0.14;
      const tempoX = game.state === 'MENU' ? -1.35 : game.tempoLaneX * LANE_WIDTH;
      const tempoZ = game.state === 'MENU' ? 2.9 : game.tempoDistance;

      this.officerGroup.position.set(tempoX, 0.05 + tempoBob, tempoZ);

      // Comedic waddle or dance rotation
      if (game.tempoState === 'dancing') {
        this.officerGroup.rotation.z = Math.sin(activeBeat * Math.PI * 2) * 0.24;
        this.officerGroup.rotation.y = Math.sin(activeBeat * Math.PI) * 0.45;
      } else if (game.tempoState === 'frustrated') {
        this.officerGroup.rotation.y = Math.sin(activeBeat * 16) * 0.3;
        this.officerGroup.rotation.z = 0;
      } else {
        this.officerGroup.rotation.z = Math.sin(activeBeat * Math.PI) * 0.08;
        this.officerGroup.rotation.y = game.state === 'MENU' ? 0.25 : 0;
      }

      if (this.dogMesh) {
        this.dogMesh.position.y = Math.abs(Math.sin(activeBeat * Math.PI * 2)) * 0.18;
      }
    }

    // 7. Dynamic Camera Follow
    const isPortrait = this.height > this.width;
    const baseCamY = isPortrait ? 4.55 : 4.15;
    this.camera.position.x = currentX * 0.75;
    this.camera.position.y =
      baseCamY + (game.isFever ? Math.sin(activeBeat * Math.PI * 2) * 0.08 : 0);

    // 8. Update 3D Track Entities (3D Musical Notes, 3D Subway Trains, Lasers, High Signals, Portals)
    for (const g of this.noteMeshes) g.visible = false;
    for (const g of this.barrierMeshes) g.visible = false;
    for (const g of this.laserMeshes) g.visible = false;
    for (const g of this.signalMeshes) g.visible = false;
    for (const m of this.pulseMeshes) m.visible = false;
    for (const m of this.portalMeshes) m.visible = false;

    if (game.state === 'PLAYING' || game.state === 'PAUSED') {
      let noteIdx = 0;
      let barrierIdx = 0;
      let laserIdx = 0;
      let signalIdx = 0;
      let pulseIdx = 0;
      let portalIdx = 0;

      for (const ent of game.entities) {
        if (!ent.active) continue;
        const beatsAhead = ent.beat - activeBeat;
        if (beatsAhead > 13.5 || beatsAhead < -0.8) continue;

        const worldZ = -beatsAhead * UNITS_PER_BEAT;

        if (ent.type === 'note' && !ent.collected && noteIdx < this.noteMeshes.length) {
          const worldX = (ent.lane - 1) * LANE_WIDTH;
          const g = this.noteMeshes[noteIdx++];
          g.visible = true;
          g.position.set(worldX, 1.0 + Math.sin(activeBeat * 4 + ent.beat) * 0.12, worldZ);

          // Rotate the 3D Musical Note (♪) core
          const noteCore = g.children[0] as THREE.Group;
          noteCore.rotation.y = activeBeat * 2.2 + ent.beat;

          // Apply material based on Note Variant (Free vs Sequence vs Challenge)
          const targetMat =
            ent.noteVariant === 'challenge'
              ? this.noteChallengeMat!
              : ent.noteVariant === 'sequence'
              ? this.noteSeqMat!
              : this.noteFreeMat!;
          noteCore.traverse((c) => {
            if (c instanceof THREE.Mesh) c.material = targetMat;
          });
        } else if (ent.type === 'barrier' && !ent.hit) {
          const worldX = (ent.lane - 1) * LANE_WIDTH;
          const kind = ent.barrierKind || (ent.isLaser ? 'low_laser' : 'train');
          if (kind === 'low_laser' && laserIdx < this.laserMeshes.length) {
            const g = this.laserMeshes[laserIdx++];
            g.visible = true;
            g.position.set(0, 0, worldZ);
          } else if (kind === 'high_signal' && signalIdx < this.signalMeshes.length) {
            const g = this.signalMeshes[signalIdx++];
            g.visible = true;
            g.position.set(0, 0, worldZ);
          } else if (kind === 'train' && barrierIdx < this.barrierMeshes.length) {
            const g = this.barrierMeshes[barrierIdx++];
            g.visible = true;
            g.position.set(worldX, 0, worldZ);
          }
        } else if (ent.type === 'pulse' && !ent.cleared && pulseIdx < this.pulseMeshes.length) {
          const worldX = (ent.lane - 1) * LANE_WIDTH;
          const m = this.pulseMeshes[pulseIdx++];
          m.visible = true;
          const px = ent.lane === -1 ? 0 : worldX;
          m.position.set(px, 1.05, worldZ);
          m.scale.set(ent.lane === -1 ? 2.4 : 1.0, 1.0, 1.0);
        } else if (ent.type === 'portal' && portalIdx < this.portalMeshes.length) {
          const m = this.portalMeshes[portalIdx++];
          m.visible = true;
          m.position.set(0, 1.8, worldZ);
          m.rotation.z = activeBeat * 1.8;
        }
      }
    }
  }

  /**
   * Renders camera-projected 2D musical pitch badges (C, D, E, G...), obstacle callouts
   * (▲ JUMP ▲, ▼ SLIDE ▼), Officer Tempo status badge, and Diegetic Timing Arc.
   */
  private renderDiegeticOverlay(
    game: GameManager,
    genre: GenreTheme,
    currentBeat: number,
    dt: number
  ): void {
    const ctx = this.ctx;

    if (game.state === 'PLAYING' || game.state === 'PAUSED') {
      for (const ent of game.entities) {
        if (!ent.active) continue;
        const beatsAhead = ent.beat - currentBeat;
        if (beatsAhead > 10.5 || beatsAhead < -0.3) continue;

        if (ent.type === 'note' && !ent.collected) {
          // Floating Musical Note Pitch Badge above each 3D Note (e.g. "♪ C", "♪ E", "♪ G")
          const p = this.project3D(ent.lane - 1, beatsAhead, 0.72);
          if (!p.visible) continue;
          ctx.save();
          ctx.fillStyle =
            ent.noteVariant === 'challenge'
              ? '#ff2a85'
              : ent.noteVariant === 'sequence'
              ? '#fbbf24'
              : '#ffffff';
          ctx.shadowColor = '#090414';
          ctx.shadowBlur = 6;
          ctx.font = `900 ${Math.max(10, Math.round(16 * p.scale))}px "Fredoka", "Russo One", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(`♪ ${ent.noteName}`, p.x, p.y);
          ctx.restore();
        } else if (ent.type === 'barrier' && !ent.hit) {
          const kind = ent.barrierKind || (ent.isLaser ? 'low_laser' : 'train');
          if (kind === 'low_laser') {
            const midP = this.project3D(0, beatsAhead, 0.56);
            if (!midP.visible) continue;
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = genre.colors.barrier;
            ctx.shadowBlur = 10;
            ctx.font = `900 ${Math.max(11, Math.round(16 * midP.scale))}px "Russo One", sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('▲ JUMP ▲', midP.x, midP.y);
            ctx.restore();
          } else if (kind === 'high_signal') {
            const midP = this.project3D(0, beatsAhead, 0.92);
            if (!midP.visible) continue;
            ctx.save();
            ctx.fillStyle = '#fbbf24';
            ctx.shadowColor = '#090414';
            ctx.shadowBlur = 10;
            ctx.font = `900 ${Math.max(11, Math.round(16 * midP.scale))}px "Russo One", sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('▼ SLIDE ▼', midP.x, midP.y);
            ctx.restore();
          }
        } else if (ent.type === 'pulse' && !ent.cleared) {
          const normLane = ent.lane === -1 ? 0 : ent.lane - 1;
          const p = this.project3D(normLane, beatsAhead, 0.45);
          if (!p.visible) continue;
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = genre.colors.pulseRing;
          ctx.shadowBlur = 10;
          ctx.font = `900 ${Math.max(10, Math.round(14 * p.scale))}px "Chakra Petch", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('PULSE', p.x, p.y);
          ctx.restore();
        } else if (ent.type === 'portal') {
          const p = this.project3D(0, beatsAhead, 1.35);
          if (!p.visible) continue;
          ctx.save();
          ctx.fillStyle = genre.colors.secondary;
          ctx.shadowColor = '#090414';
          ctx.shadowBlur = 8;
          ctx.font = `900 ${Math.max(12, Math.round(18 * p.scale))}px "Russo One", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(`PORTAL: ${ent.targetGenre.toUpperCase()}`, p.x, p.y);
          ctx.restore();
        }
      }

      // 2. Floating Musical Symbol above Beat when collecting a note (0.3s)
      if (game.noteGestureTimer > 0) {
        const beatHeadP = this.project3D(
          game.currentLaneX,
          0,
          0.85 + (game.isJumping ? 0.6 : 0)
        );
        if (beatHeadP.visible) {
          ctx.save();
          ctx.fillStyle = '#00f3ff';
          ctx.shadowColor = '#090414';
          ctx.shadowBlur = 8;
          ctx.font = '900 20px "Fredoka", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`♫ ${game.lastCollectedPitch}`, beatHeadP.x, beatHeadP.y - 12);
          ctx.restore();
        }
      }

      // 3. Officer Tempo Diegetic Status Callout above Officer Tempo's cap
      const tempoBeatsBehind = -game.tempoDistance / UNITS_PER_BEAT;
      const tempoP = this.project3D(game.tempoLaneX, tempoBeatsBehind, 0.92);
      if (tempoP.visible) {
        ctx.save();
        let tempoLabel = '';
        let tempoColor = '#fbbf24';
        if (game.tempoState === 'lunging') {
          tempoLabel = '🚨 OFFICER TEMPO: DANGER CLOSE!';
          tempoColor = '#ff1744';
        } else if (game.tempoState === 'frustrated') {
          tempoLabel = '😤 OFFICER TEMPO: OUTSMARTED!';
          tempoColor = '#4ade80';
        } else if (game.tempoState === 'dancing') {
          tempoLabel = '🕺 OFFICER TEMPO: TRYING TO DANCE!';
          tempoColor = '#00f3ff';
        }
        if (tempoLabel) {
          ctx.fillStyle = tempoColor;
          ctx.shadowColor = '#090414';
          ctx.shadowBlur = 8;
          ctx.font = '900 12px "Nunito", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(tempoLabel, tempoP.x, Math.min(this.height - 22, tempoP.y));
        }
        ctx.restore();
      }
    }

    // 4. Diegetic Strike-Line Timing Arc
    if (this.timingArcOpacity > 0) {
      this.timingArcOpacity = Math.max(0, this.timingArcOpacity - dt * 2.2);
      const arcCenter = this.project3D(0, 0, 0);
      const arcWidth = Math.min(180, this.width * 0.38);
      const arcY = arcCenter.y + 18;

      ctx.save();
      ctx.globalAlpha = this.timingArcOpacity;

      ctx.fillStyle = '#090414dd';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(arcCenter.x - arcWidth / 2, arcY, arcWidth, 10, 5);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arcCenter.x, arcY);
      ctx.lineTo(arcCenter.x, arcY + 10);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EARLY', arcCenter.x - arcWidth * 0.35, arcY - 3);
      ctx.fillText('LATE', arcCenter.x + arcWidth * 0.35, arcY - 3);

      if (this.lastTimingDeltaMs !== null) {
        const clampedDelta = Math.max(-100, Math.min(100, this.lastTimingDeltaMs));
        const needleX = arcCenter.x + (clampedDelta / 100) * (arcWidth / 2 - 6);
        const pipColor =
          Math.abs(clampedDelta) <= 35
            ? '#00ffff'
            : Math.abs(clampedDelta) <= 70
            ? '#ffeb3b'
            : '#ff9800';

        ctx.fillStyle = pipColor;
        ctx.shadowColor = pipColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(needleX, arcY + 5, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderSky(genre: GenreTheme, _beat: number): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.horizonY);
    grad.addColorStop(0, genre.colors.skyTop);
    grad.addColorStop(1, genre.colors.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.horizonY);
  }

  private renderHorizonSun(genre: GenreTheme, beat: number): void {
    const ctx = this.ctx;
    const beatFraction = beat % 1;
    const pulse = 1.0 + Math.sin(beatFraction * Math.PI) * 0.12;

    const sunRadius = Math.min(this.width * 0.12, 70) * pulse;
    const sunGrad = ctx.createRadialGradient(
      this.vanishingX,
      this.horizonY - 15,
      sunRadius * 0.1,
      this.vanishingX,
      this.horizonY - 15,
      sunRadius
    );
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.4, genre.colors.secondary);
    sunGrad.addColorStop(1, `${genre.colors.primary}00`);

    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(this.vanishingX, this.horizonY - 15, sunRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderSideEqualizers(genre: GenreTheme, beat: number): void {
    const ctx = this.ctx;
    const barsCount = 12;
    const barWidth = 6;
    const spacing = 10;
    const beatPhase = (beat * 2) % Math.PI;

    ctx.fillStyle = genre.colors.secondary;
    for (let i = 0; i < barsCount; i++) {
      const h1 = 15 + Math.sin(beatPhase + i * 0.7) * 25 + (i % 3) * 8;
      const leftX = this.width * 0.08 + i * (barWidth + spacing);
      const rightX = this.width * 0.92 - i * (barWidth + spacing);

      ctx.fillRect(leftX, this.horizonY - h1, barWidth, h1);
      ctx.fillRect(rightX, this.horizonY - h1, barWidth, h1);
    }
  }

  private renderHighway(genre: GenreTheme, currentBeat: number, _dt: number): void {
    const ctx = this.ctx;

    const bottomP = this.project3D(0, 0);
    const topP = this.project3D(0, 12);
    const leftBottom = this.project3D(-1.6, 0);
    const rightBottom = this.project3D(1.6, 0);
    const leftTop = this.project3D(-1.6, 12);
    const rightTop = this.project3D(1.6, 12);

    ctx.fillStyle = genre.colors.highway;
    ctx.beginPath();
    ctx.moveTo(leftTop.x, topP.y);
    ctx.lineTo(rightTop.x, topP.y);
    ctx.lineTo(rightBottom.x, bottomP.y + 40);
    ctx.lineTo(leftBottom.x, bottomP.y + 40);
    ctx.closePath();
    ctx.fill();

    const startBeatInt = Math.floor(currentBeat);
    for (let b = startBeatInt; b <= startBeatInt + 12; b++) {
      const beatsAhead = b - currentBeat;
      if (beatsAhead < 0) continue;

      const pL = this.project3D(-1.55, beatsAhead);
      const pR = this.project3D(1.55, beatsAhead);
      if (!pL.visible || !pR.visible) continue;

      const isMeasureBar = b % 4 === 0;
      ctx.strokeStyle = isMeasureBar ? genre.colors.primary : genre.colors.secondary;
      ctx.lineWidth = isMeasureBar ? 3 * pL.scale : 1.5 * pL.scale;
      ctx.globalAlpha = pL.scale;

      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pR.x, pR.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  private renderEntities(entities: TrackEntity[], currentBeat: number, genre: GenreTheme): void {
    const ctx = this.ctx;
    const sorted = [...entities].filter((e) => e.active).sort((a, b) => b.beat - a.beat);

    for (const ent of sorted) {
      const beatsAhead = ent.beat - currentBeat;
      if (beatsAhead > 13 || beatsAhead < -0.8) continue;

      if (ent.type === 'note' && !ent.collected) {
        const normLane = ent.lane - 1;
        const p = this.project3D(normLane, beatsAhead, 0.2);
        if (!p.visible) continue;

        const radius = Math.max(6, 22 * p.scale);
        ctx.fillStyle = genre.colors.note;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#090414';
        ctx.font = `bold ${Math.max(9, Math.round(14 * p.scale))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`♪${ent.noteName}`, p.x, p.y + 4 * p.scale);
      }
    }
  }

  private renderPlayer(game: GameManager, genre: GenreTheme): void {
    const ctx = this.ctx;
    const skin = storage.getEquippedSkin();
    const primaryColor = skin.primaryColor || genre.colors.player;

    const currentX = game.state === 'MENU' ? 0 : game.currentLaneX;
    const jumpOffset = game.isJumping ? Math.sin(game.jumpProgress * Math.PI) * 0.7 : 0;
    const p = this.project3D(currentX, 0, jumpOffset);
    if (!p.visible) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderParticlesAndFX(dt: number, genre: GenreTheme): void {
    const ctx = this.ctx;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.life -= dt;
      part.alpha = Math.max(0, part.life / 0.5);

      if (part.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = part.color;
      ctx.globalAlpha = part.alpha;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    if (this.pulseShockwave > 0) {
      this.pulseShockwave = Math.max(0, this.pulseShockwave - dt * 2.5);
      const waveRadius = (1 - this.pulseShockwave) * (this.width * 0.5);
      ctx.strokeStyle = `${genre.colors.glow}${Math.floor(this.pulseShockwave * 255)
        .toString(16)
        .padStart(2, '0')}`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.vanishingX, this.strikeY, waveRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private renderFloatingText(dt: number): void {
    const ctx = this.ctx;

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 45 * dt;
      ft.life -= dt;
      ft.opacity = Math.max(0, ft.life / 0.9);

      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.fillStyle = ft.color;
      ctx.globalAlpha = ft.opacity;
      ctx.font = `900 ${Math.round(20 * ft.scale)}px "Russo One", "Fredoka", sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#090414';
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1.0;
  }

  private renderFeverAura(genre: GenreTheme): void {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(
      this.vanishingX,
      this.height / 2,
      this.width * 0.35,
      this.vanishingX,
      this.height / 2,
      this.width * 0.55
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `${genre.colors.glow}44`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  public dispose(): void {
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
    }
    this.webglRenderer?.dispose();
    this.webglCanvas?.remove();
  }
}
