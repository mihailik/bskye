// @ts-check

/** @type {import('three')} */
var THREE;

function bskye() {

  function loading() {
    var middle = document.createElement('div');
    middle.style.cssText = 'position: absolute; top:0;left:0;width:100%;height:100%; display: grid; grid-template-row: 1fr; grid-template-column: 1fr; align-items: center; justify-items: center;';
    document.body.appendChild(middle);
    var central = document.createElement('div');
    central.textContent = 'Loading...';
    middle.appendChild(central);
  }

  function createScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshLambertMaterial({ color: 0x4080FF });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    const remote = new THREE.BoxGeometry(40, 40, 1);
    const remotePaint = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const remoteCube = new THREE.Mesh(remote, remotePaint);
    remoteCube.position.z = -5;
    scene.add(remoteCube);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    scene.add(directionalLight);

    const light = new THREE.HemisphereLight(0xDDDDFF, 0x09090A, 1);
    scene.add(light);

    camera.position.z = 5;

    var last = Date.now();
    animate();

    function animate() {
      requestAnimationFrame(animate);

      const next = Date.now();
      const step = Math.min(next - last, 200) / 10;
      last = next;
      cube.rotation.x += 0.01 * step;
      cube.rotation.y += 0.015 * step;

      renderer.render(scene, camera);
    }
  }

  if (typeof THREE !== 'undefined') {
    createScene();
  } else {
    loading();
  }
}