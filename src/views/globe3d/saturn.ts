import { DoubleSide, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { SATURN } from '../../physics/bodies';
import { radialScale } from './coords';

/** Полярная полуось NAIF PCK00011. В расчёт высоты входит только SATURN.radius. */
export const SATURN_POLAR_RATIO = 54364 / SATURN.radius;
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

/** Границы полос по NASA PDS Ring-Moon Systems Node. Плотность и цвет приближённые. */
export function saturnRingMaterial(sunDir: { value: Vector3 }, nightOn: { value: number }) {
  return new ShaderMaterial({
    uniforms: { sunDir, nightOn, radiusKm: { value: SATURN.radius }, polarRatio: { value: SATURN_POLAR_RATIO } },
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
      uniform float radiusKm;
      uniform float polarRatio;
      varying vec3 vRingPosition;

      float band(float r, float edge, float from, float to) {
        return smoothstep(from - edge, from + edge, r) * (1.0 - smoothstep(to - edge, to + edge, r));
      }

      void main() {
        float r = length(vRingPosition.xz) * radiusKm;
        float edge = max(12.0, fwidth(r) * 0.65);
        float d = band(r, edge, 66900.0, 74491.0);
        float c = band(r, edge, 74491.0, 91975.0);
        float b = band(r, edge, 91975.0, 117545.0);
        float a = band(r, edge, 122050.0, 136770.0) * (1.0 - 0.82 * band(r, edge, 133423.0, 133745.0));
        float f = band(r, edge, 139826.0, 140612.0);
        float alpha = 0.045 * d + 0.31 * c + 0.87 * b + 0.64 * a + 0.36 * f;
        float stripes = 0.88
          + 0.085 * sin(r * 0.00155) * (1.0 - smoothstep(700.0, 2500.0, edge))
          + 0.065 * sin(r * 0.0044) * (1.0 - smoothstep(210.0, 850.0, edge));
        vec3 color = mix(vec3(0.69, 0.58, 0.43), vec3(0.92, 0.81, 0.64), b);

        // Луч от точки кольца к Солнцу. Растяжение по Y сводит пересечение эллипсоида к шару.
        vec3 p = vRingPosition;
        vec3 ray = normalize(vec3(sunDir.x, sunDir.y / polarRatio, sunDir.z));
        float distanceAlong = max(0.0, -dot(p, ray));
        float clear = smoothstep(0.99, 1.015, length(p + distanceAlong * ray));
        vec3 viewDir = normalize(cameraPosition - vRingPosition);
        float sameSide = step(0.0, viewDir.y * sunDir.y);
        float illumination = mix(0.78, 0.72 + 0.48 * abs(sunDir.y), sameSide);
        float light = mix(1.0, illumination * mix(0.16, 1.0, clear), nightOn);
        gl_FragColor = vec4(color * stripes * light, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
