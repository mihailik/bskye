// @ts-check

/** @type {import('three')} */
var THREE;
/** @type {typeof import('./lib/node_modules/@atproto/api')} */
var aptproto_api;
/** @type {typeof import('./lib/node_modules/dexie')} */
var dexie;

function bskye() {

  function initIndexedDBDexie() {
    var db = new dexie.Dexie('bskye');
    db.version(5).stores({
      users: 'did, handle, *words',
      cursors: 'key'
    });

    return db;
  }

  const apis = (function () {

    const bskyAPIBasePath = 'https://bsky.social/xrpc/';

    /** @typedef {{ [K in keyof T]: T[K] extends TypedAs ? K : never }[keyof T]} TypedKeyOf<T, TypedAs>
     * @template T @template TypedAs
     */

    function listUsersStreaming(startWithCursor, callback) {
      const agent = new aptproto_api.BskyAgent({
        service: bskyAPIBasePath,
      });

      withCursor(startWithCursor);

      function withCursor(cursor) {
        agent.com.atproto.sync.listRepos({ cursor }).then(
          reply => {
            if (!reply.data.cursor || !reply.data.repos?.length) {
              callback();
              return;
            }

            const didOnly = reply.data.repos.map(repo => repo.did);
            callback(undefined, didOnly, reply.data.cursor);

            withCursor(reply.data.cursor);
          },
          error => {
            callback(error);
          }
        );
      }
    }

    async function searchActorsStreaming(term, startWithCursor, callback) {
      const agent = new aptproto_api.BskyAgent({
        service: bskyAPIBasePath,
      });

      withCursor(startWithCursor);

      function withCursor(cursor) {
        agent.app.bsky.actor.searchActors({ cursor, term, limit: 100 }).then(
          reply => {
            if (!reply.data.cursor || !reply.data.actors?.length) {
              callback();
              return;
            }

            callback(undefined, reply.data.actors, reply.data.cursor);

            withCursor(reply.data.cursor);
          },
          error => {
            callback(error);
          }
        );
      }
    }

    async function listUserRecordsOfType(did, collection) {
      const agent = new aptproto_api.BskyAgent({
        service: bskyAPIBasePath,
      });
      const response = await agent.com.atproto.repo.listRecords({ repo: did, collection });
      return response.data.records;
    }

    async function listUserFollows(did) {
      const follows = (await listUserRecordsOfType(did, 'app.bsky.graph.follow')).map(record =>({
        did: record.value.subject,
        time: Date.parse(record.value.createdAt)
      }));

      return follows;
    }

    async function getUserProfile(did) {
      const profileRecords = await listUserRecordsOfType(did, 'app.bsky.actor.profile');
      return profileRecords[0] && {
        description: profileRecords[0].value.description,
        displayName: profileRecords[0].value.displayName
      };
    }

    async function getUserHandle(did) {
      const agent = new aptproto_api.BskyAgent({
        service: bskyAPIBasePath,
      });
      agent.app.bsky.actor.searchActors({ })
      const response = await agent.com.atproto.repo.describeRepo({ repo: did });
      return response.data.handle;
    }

    async function getRepo(did) {
      const repoArrayBuffer = await fetchGET(bskyAPIBasePath + 'com.atproto.sync.getRepo?did=' + did, 'arrayBuffer');

      var carReader = await ipld_car.CarReader.fromBytes(new Uint8Array(repoArrayBuffer));
      var blocks = [];
      for (const block of carReader._blocks) {
        var record = cbor_x.decode(block.bytes);
        if (!record.$type) continue; // removed??
        blocks.push({
          cid: block.cid,
          record: cbor_x.decode(block.bytes)
        });
      }
      carReader.BLOCKS = blocks;
      return carReader;
    }

    return {
      bskyAPIBasePath,
      listUsersStreaming,
      searchActorsStreaming,
      getUserHandle,
      listUserRecordsOfType,
      listUserFollows,
      getUserProfile
    };

  })();

  async function loadBskyData() {
    const db = initIndexedDBDexie();

    /** @type {string[]} */
    const didsToUpdate = [];
    const didsToUpdateSet = new Set();

    for (const user of await db.users.where('handle').equals('?').toArray()) {
      didsToUpdateSet.add(user.did);
      didsToUpdate.push(user.did);
    }

    const startWithCursor = (await db.cursors.where('key').equals('users').first())?.cursor;

    let totalUserCount = 0;
    let usersFetched = false;
    const startTime = Date.now();
    apis.listUsersStreaming(startWithCursor, (error, users, latestCursor) => {
      if (error) {
        console.error(error);
        return;
      }

      const spentMsec = Date.now() - startTime;

      if (!users?.length) {
        console.log(
          'Finished with ' + totalUserCount + ' added users in ' +
          spentMsec / 1000 + 'sec ' +
          (totalUserCount / (spentMsec / 1000)).toFixed(2) + ' users/sec'
        );
        usersFetched = true;
      } else {

        db.users.bulkPut(users.map(did => ({ did, handle: '?' }))).then(() =>
          db.cursors.put({ key: 'users', cursor: latestCursor }));

        for (const did of users) {
          if (!didsToUpdateSet.has(did)) {
            didsToUpdateSet.add(did);
            didsToUpdate.push(did);
          }
        }

        console.log(
          'bskyData[' + (totalUserCount + 1) + '..' + (totalUserCount + users.length) + ']: ',
          users.length,
          spentMsec / 1000 + 'sec ' +
          (totalUserCount / (spentMsec / 1000)).toFixed(2) + ' users/sec'
        );

        totalUserCount += users.length;
      }
    });

    updateUsersWithSearch();

    async function updateUsersWithSearch() {

      const startWithCursor = (await db.cursors.where('key').equals('usersBskySearch').first())?.cursor;

      let lastReport = Date.now();
      let updatedUserCount = 0;
      let updatedSinceLastReport = 0;

      const wordsSet = new Set();
      apis.searchActorsStreaming('bsky.social', startWithCursor, (error, users, latestCursor) => {
        if (!latestCursor || !users?.length) {
          console.log('Finished with ' + updatedUserCount + ' enriched users');
          return;
        }

        const usersBatch = [];
        for (const user of users) {
          const { did, handle, displayName, description } = user;
          addWords(handle, wordsSet);
          addWords(displayName, wordsSet);
          addWords(description, wordsSet);
          const words = [...wordsSet];
          usersBatch.push({ did, handle, displayName, description, words });
          wordsSet.clear();

          updatedUserCount++;
          updatedSinceLastReport++;
        }

        db.users.bulkPut(usersBatch).then(() =>
          db.cursors.put({ key: 'usersBskySearch', cursor: latestCursor }));
        
        const sinceLastReport = Date.now() - lastReport;
        if (sinceLastReport > 3000) {
          console.log(
            'updated ' + updatedSinceLastReport + ' users, ' +
            Math.round(sinceLastReport / updatedSinceLastReport) + 'ms per user, ' +
            didsToUpdate.length + ' remaining (' +
            Math.round(didsToUpdate.length * (sinceLastReport / updatedSinceLastReport) / 1000 / 60 / 60) + 'h)',
            usersBatch[0]);
          lastReport = Date.now();
          updatedSinceLastReport = 0;
        }
 
      });


    }

    async function updateUsersOneByOne() {

      const wordsSet = new Set();

      let lastReport = Date.now();
      let updatedUserCount = 0;
      let updatedSinceLastReport = 0;

      while (didsToUpdate.length || !usersFetched) {
        const did = didsToUpdate.pop();
        if (!did) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        }

        const [handle, profile] = await Promise.all([
          apis.getUserHandle(did),
          apis.getUserProfile(did)
        ]);

        addWords(handle, wordsSet);
        addWords(profile?.displayName, wordsSet);
        addWords(profile?.description, wordsSet);

        const updateUser = {
          handle,
          words: [...wordsSet],
          displayName: profile?.displayName,
          description: profile?.description
        };
        db.users.update(did, updateUser);

        updatedUserCount++;
        updatedSinceLastReport++;
        wordsSet.clear();

        const sinceLastReport = Date.now() - lastReport;
        if (sinceLastReport > 3000) {
          console.log(
            'updated ' + updatedSinceLastReport + ' users, ' +
            Math.round(sinceLastReport / updatedSinceLastReport) + 'ms per user, ' +
            didsToUpdate.length + ' remaining (' +
            Math.round(didsToUpdate.length * (sinceLastReport / updatedSinceLastReport) / 1000 / 60 / 60) + 'h)',
            updateUser);
          lastReport = Date.now();
          updatedSinceLastReport = 0;
        }
      }
    }

    /** @type {RegExp | undefined} */
    var splitRegExp;
    /** @type {RegExp | undefined} */
    var trailBskySocialRegExp;

    function addWords(words, wordsSet) {
      if (!words) return;
      if (!splitRegExp) splitRegExp = /[\s\!-\@\[-\`\{-\~]+/g;
      if (!trailBskySocialRegExp) trailBskySocialRegExp = /\.bsky\.social$/;
      for (const word of words.replace(trailBskySocialRegExp, '').split(splitRegExp)) {
        if (!word) continue;
        wordsSet.add(word);
      }
    }
  }

  function loading() {
    var middle = document.createElement('div');
    middle.style.cssText = 'position: absolute; top:0;left:0;width:100%;height:100%; display: grid; grid-template-row: 1fr; grid-template-column: 1fr; align-items: center; justify-items: center;';
    document.body.appendChild(middle);
    var central = document.createElement('div');
    central.textContent = 'Loading...';
    middle.appendChild(central);

    bskye.libLoaded = function () {
      middle.parentElement?.removeChild(middle);
      createScene();
    };
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

  const bskyDataAsync = loadBskyData();

  if (typeof THREE !== 'undefined') {
    createScene();
  } else {
    loading();
  }
}