precision highp float;
uniform vec2 resolution;
uniform sampler2D iChannel0;
uniform float time;
uniform float motion;
varying vec2 fragCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// Analytic wave derivatives keep lighting smooth without extra height samples.
void wave(vec2 p, vec2 dir, float wavelength, float amplitude, float speed,
          float t, inout float height, inout vec2 slope) {
  float k = 6.2831853 / wavelength;
  float phase = dot(p, dir) * k - t * speed;
  height += sin(phase) * amplitude;
  slope += cos(phase) * amplitude * k * dir;
}

void main() {
  vec2 p = vec2(fragCoord.x, resolution.y - fragCoord.y);
  vec4 shore = texture2D(iChannel0, p / resolution);
  // The mask is opaque: G is coverage, R is distance in board pixels / 96.
  float coverage = shore.g;
  if (coverage < 0.01) discard;
  float distance = shore.r * 96.0;
  float t = time * motion;
  vec2 slope = vec2(0.0);
  float height = 0.0;
  wave(p, vec2(0.94, 0.342), 116.0, 2.8, 0.85, t, height, slope);
  wave(p, vec2(-0.6, 0.8), 69.0, 1.25, 1.12, t, height, slope);
  wave(p, vec2(0.8, 0.6), 32.0, 0.40, 1.65, t, height, slope);
  wave(p, vec2(-0.28, 0.96), 17.0, 0.14, 2.10, t, height, slope);
  float grain = noise(p * 0.075 + slope * 2.0 - vec2(t * 0.035, 0.0));
  float cloud = noise(p * 0.012 + vec2(t * 0.012, -t * 0.009));
  float depth = smoothstep(0.0, 65.0, distance);
  vec3 color = mix(vec3(0.075, 0.28, 0.29), vec3(0.015, 0.105, 0.17), depth);
  color += (cloud - 0.5) * vec3(0.025, 0.045, 0.05);
  color += (grain - 0.5) * 0.017;
  vec3 normal = normalize(vec3(-slope.x, -slope.y * 1.45, 1.0));
  vec3 light = normalize(vec3(-0.45, -0.6, 0.8));
  color *= 0.83 + 0.30 * max(dot(normal, light), 0.0);
  float reflection = pow(max(dot(normal, normalize(vec3(-0.24, -0.32, 1.0))), 0.0), 85.0);
  color += vec3(0.34, 0.49, 0.52) * reflection * 0.20;
  float crest = smoothstep(2.7, 4.3, height) * smoothstep(0.40, 0.72, grain);
  color = mix(color, vec3(0.49, 0.69, 0.67), crest * 0.24 * depth);
  // Broken, advancing wash hugs the actual coast instead of individual hexes.
  float wash = 0.5 + 0.5 * sin(t * 0.8 + cloud * 3.0);
  float front = 2.0 + wash * 6.0;
  float foam = (1.0 - smoothstep(0.8, 2.7, abs(distance - front + (grain - 0.5) * 3.0)));
  foam *= smoothstep(0.25, 0.68, grain) * (0.20 + wash * 0.30);
  foam += (1.0 - smoothstep(0.0, 2.0, distance)) * 0.20;
  color = mix(color, vec3(0.66, 0.78, 0.69), clamp(foam, 0.0, 0.65));
  gl_FragColor = vec4(color * coverage, coverage);
}
