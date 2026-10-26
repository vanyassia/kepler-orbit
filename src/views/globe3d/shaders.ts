/**
 * Шейдеры глобуса (GLSL ES 3.00 через ShaderMaterial three.js).
 * Освещение — по реальному направлению на Солнце (формула (15)), в мировых координатах сцены.
 */

const worldVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/** Поверхность Земли: день/ночь, огни городов, рельеф, блики океана, тени облаков, дымка у края. */
export const earthShader = {
  vertexShader: worldVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D dayMap;
    uniform sampler2D nightMap;
    uniform sampler2D normalMap;
    uniform sampler2D specMap;
    uniform sampler2D cloudsMap;
    uniform vec3 sunDir;
    uniform float cloudShift;
    uniform float cloudsOn;
    uniform float nightOn;
    uniform float normalStrength;
    uniform vec3 hazeColor;
    uniform float hazeStrength;
    uniform float duskStrength;
    uniform float nightAmbient;
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    void main() {
      vec3 N = normalize(vWorldNormal);
      // Касательный базис сферы: восток и север (ось вращения Земли — ось Y сцены)
      vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-5, 0.0, 0.0));
      vec3 north = cross(N, east);
      vec3 tn = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
      vec3 Np = normalize(N + normalStrength * (east * tn.x + north * tn.y));

      vec3 V = normalize(cameraPosition - vWorldPos);
      float cosSun = dot(N, sunDir);                  // косинус зенитного расстояния Солнца
      float dayMix = smoothstep(-0.10, 0.16, cosSun); // плавный терминатор (сумерки)
      // Слой «день и ночь» выключен — Земля освещена равномерно
      float diffuse = mix(0.9, max(dot(Np, sunDir), 0.0), nightOn);

      // Серый фон снимка облаков (≈0,1–0,15) отсекаем, чтобы не было сплошной дымки
      float cloud = smoothstep(0.18, 0.8, texture2D(cloudsMap, vUv + vec2(cloudShift, 0.0)).r) * cloudsOn;
      vec3 day = texture2D(dayMap, vUv).rgb;
      float ocean = texture2D(specMap, vUv).r;

      // Блик Солнца на воде (модель Блинна — Фонга)
      vec3 H = normalize(sunDir + V);
      float glint = pow(max(dot(Np, H), 0.0), 70.0) * ocean * (1.0 - cloud);
      vec3 dayColor = day * (0.04 + 1.12 * diffuse) * (1.0 - 0.45 * cloud)
                    + vec3(1.0, 0.92, 0.78) * glint * 0.85 * step(0.0, cosSun);

      // Огни городов: подавляем тусклую подсветку суши, усиливаем яркие огни
      vec3 lights = texture2D(nightMap, vUv).rgb;
      lights = pow(lights, vec3(1.7)) * 2.6 * (1.0 - 0.7 * cloud);
      // Ночная сторона: у Земли — огни городов, у Луны и Марса — слабая подсветка («пепельный свет»)
      vec3 nightColor = mix(vec3(0.004, 0.008, 0.018), lights, nightOn) + day * nightAmbient;

      vec3 color = mix(nightColor, dayColor, nightOn > 0.5 ? dayMix : 1.0);

      // Тёплая полоса сумерек у терминатора
      float dusk = exp(-pow(cosSun / 0.09, 2.0));
      color += vec3(0.9, 0.38, 0.12) * dusk * 0.06 * nightOn * duskStrength;

      // Атмосферная дымка у края диска на дневной стороне
      float fres = pow(1.0 - max(dot(V, N), 0.0), 2.6);
      color = mix(color, hazeColor, fres * hazeStrength * smoothstep(-0.25, 0.45, cosSun));

      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

/** Облака: отдельная сфера чуть выше поверхности, на ночной стороне почти не видны. */
export const cloudsShader = {
  vertexShader: worldVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D cloudsMap;
    uniform vec3 sunDir;
    uniform float cloudShift;
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    void main() {
      vec3 N = normalize(vWorldNormal);
      float a = smoothstep(0.18, 0.8, texture2D(cloudsMap, vUv + vec2(cloudShift, 0.0)).r);
      float cosSun = dot(N, sunDir);
      float lit = smoothstep(-0.12, 0.22, cosSun);
      vec3 col = vec3(1.0) * (0.06 + 0.98 * max(cosSun, 0.0)) + vec3(0.9, 0.45, 0.2) * exp(-pow(cosSun / 0.08, 2.0)) * 0.12;
      gl_FragColor = vec4(col, a * mix(0.06, 0.92, lit));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

/** Свечение атмосферы вокруг диска (внутренняя сторона сферы, аддитивное смешение). */
export const atmosphereShader = {
  vertexShader: /* glsl */ `
    varying vec3 vNormalView;
    varying vec3 vWorldNormal;
    void main() {
      vNormalView = normalize(normalMatrix * normal);
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 sunDir;
    uniform vec3 atmoColor;
    varying vec3 vNormalView;
    varying vec3 vWorldNormal;
    void main() {
      float rim = pow(max(0.0, 0.62 - dot(vNormalView, vec3(0.0, 0.0, 1.0))), 4.0);
      float sunSide = smoothstep(-0.45, 0.4, dot(normalize(vWorldNormal), sunDir));
      vec3 col = atmoColor * rim * (0.08 + 1.5 * sunSide);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};
