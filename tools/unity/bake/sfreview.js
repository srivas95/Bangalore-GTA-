// Review page for the Sketchfab vehicle bake: bakes each picked model and returns a picture of it
// (wheels tinted red, a blue arrow at the front) plus what was found. sfreview.mjs drives it.
import * as THREE from 'three';
import { bakeVehicle, reviewImage } from './sketchfab.js';
import { bakePerson, reviewPerson } from './sketchfab_people.js';

window.review = async (picks) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const out = [];
  for (const cfg of picks) {
    try {
      const t = await bakeVehicle(cfg);
      out.push({ uid: cfg.uid, type: cfg.type, name: cfg.name, wheels: t.wheels.length, front: t.wheels.filter((w) => w.front).length, tris: t.geometry.attributes.position.count / 3,
        size: [t.length, t.width, t.height].map((x) => +x.toFixed(2)), atlas: [t.atlas.width, t.atlas.height], img: reviewImage(t, renderer) });
    } catch (e) { out.push({ uid: cfg.uid, type: cfg.type, name: cfg.name, error: String(e && e.stack || e) }); }
  }
  return out;
};
window.reviewPeople = async (picks) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const out = [];
  for (const cfg of picks) {
    try {
      const t = await bakePerson(cfg);
      out.push({ uid: cfg.uid, type: cfg.role || 'walker', name: cfg.name, height: +t.height.toFixed(2), tris: t.geometry.attributes.position.count / 3, map: t.dbg, img: reviewPerson(t, renderer) });
    } catch (e) { out.push({ uid: cfg.uid, type: cfg.role || 'walker', name: cfg.name, error: String(e && e.stack || e) }); }
  }
  return out;
};
window.ready = true;
