import * as THREE from 'three';

import * as aptproto_api from '@atproto/api';

import * as dexie from 'dexie';

window.THREE = THREE;

window.aptproto_api = aptproto_api;

window.dexie = dexie;

if (typeof bsky !== 'undefined' && bsky && typeof bsky.libLoaded === 'function') {
  bsky.libLoaded();
}