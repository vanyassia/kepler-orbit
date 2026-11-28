import { DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { SATURN } from '../../physics/bodies';
import { radialScale } from './coords';
import ringProfile from './saturn-rings.base64?raw';

/** Полярная полуось NAIF PCK00011. В расчёт высоты входит только SATURN.radius. */
export const SATURN_POLAR_RATIO = SATURN.polarRadius! / SATURN.radius;
export const SATURN_RING_INNER = 66900 / SATURN.radius;
export const SATURN_RING_OUTER = 140612 / SATURN.radius;

/** UV остаются привязаны к планетоцентрическим широтам, как и точки трассы. */
export function saturnGlobeGeometry(): SphereGeometry {
  const mesh = new SphereGeometry(1, 192, 96);
  const position = mesh.attributes.position;
  const normal = mesh.attributes.normal;
  const gradient = new Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = radialScale(y, SATURN_POLAR_RATIO);
    position.setXYZ(i, x * length, y * length, z * length);
    gradient.set(x, y / SATURN_POLAR_RATIO ** 2, z).normalize();
    normal.setXYZ(i, gradient.x, gradient.y, gradient.z);
  }
  return mesh;
}

/** Радиальный профиль из снимка «Кассини» PIA11142. См. scripts/build-saturn-rings.mjs. */
export function saturnRingMaterial(sunDir: { value: Vector3 }, nightOn: { value: number }) {
  const bytes = atob(ringProfile);
  const data = Uint8Array.from(bytes, (byte) => byte.charCodeAt(0));
  const profile = new DataTexture(data, data.length / 4, 1);
  profile.magFilter = LinearFilter;
  profile.minFilter = LinearMipmapLinearFilter;
  profile.generateMipmaps = true;
  profile.needsUpdate = true;

  const material = new ShaderMaterial({
    uniforms: {
      sunDir,
      nightOn,
      ringProfile: { value: profile },
      ringInner: { value: SATURN_RING_INNER },
      ringSpan: { value: SATURN_RING_OUTER - SATURN_RING_INNER },
      polarRatio: { value: SATURN_POLAR_RATIO },
    },
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
    vertexShader: /* glsl */ `
      varying vec3 vRingPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vRingPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform float nightOn;
      uniform sampler2D ringProfile;
      uniform float ringInner;
      uniform float ringSpan;
      uniform float polarRatio;
      varying vec3 vRingPosition;

      void main() {
        float u = (length(vRingPosition.xz) - ringInner) / ringSpan;
        vec4 profile = texture2D(ringProfile, vec2(u, 0.5));

        // Луч от точки кольца к Солнцу. Растяжение по Y сводит пересечение эллипсоида к шару.
        vec3 p = vRingPosition;
        vec3 ray = normalize(vec3(sunDir.x, sunDir.y / polarRatio, sunDir.z));
        float distanceAlong = max(0.0, -dot(p, ray));
        float clear = smoothstep(0.99, 1.015, length(p + distanceAlong * ray));
        vec3 viewDir = normalize(cameraPosition - vRingPosition);
        float sameSide = step(0.0, viewDir.y * sunDir.y);
        float illumination = mix(0.78, 0.72 + 0.48 * abs(sunDir.y), sameSide);
        float light = mix(1.0, illumination * mix(0.16, 1.0, clear), nightOn);
        gl_FragColor = vec4(profile.rgb * light / max(profile.a, 0.001), profile.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  material.addEventListener('dispose', () => profile.dispose());
  return material;
}
