precision highp float;
uniform vec2 resolution;
uniform vec2 mapSize;
uniform float environmentTime;
uniform float motion;
varying vec2 fragCoord;

vec2 gradient(vec2 p) {
  vec2 h = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(h) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  return 0.5 + 0.5 * mix(
    mix(dot(gradient(i), f), dot(gradient(i+vec2(1,0)), f-vec2(1,0)), u.x),
    mix(dot(gradient(i+vec2(0,1)), f-vec2(0,1)), dot(gradient(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y);
}
void main() {
  vec2 p = vec2(fragCoord.x, resolution.y-fragCoord.y);
  vec2 board = p - vec2(39.8371686, 46.0);
  float row = floor(board.y/69.0 + 0.5);
  float edge = 10000.0;
  // Union of pointy hexes clips only the board perimeter, never internal edges.
  for (int j=-1; j<=1; j++) {
    float r = row + float(j);
    float q = floor(board.x/79.6743371 - mod(r,2.0)*0.5 + 0.5);
    if (r>=0.0 && r<mapSize.y && q>=0.0 && q<mapSize.x) {
      vec2 d = abs(board - vec2((q+mod(r,2.0)*0.5)*79.6743371,r*69.0));
      edge = min(edge, max(d.x-39.8371686, dot(d,vec2(0.5,0.8660254))-39.8371686));
    }
  }
  float mask = 1.0-smoothstep(-0.6,0.6,edge);
  if (mask<=0.0) discard;
  float t = environmentTime*motion*0.33;
  // Match the dominant water wave: subtract the offset to travel down-right.
  vec2 windPosition = p - vec2(0.94,0.342)*t*26.3;
  float primary = noise(windPosition/368.0);
  float detail = noise(windPosition/161.0);
  float coverage = smoothstep(0.46,0.58,primary*0.72+detail*0.28);
  gl_FragColor = vec4(0.0,0.0,0.0,coverage*0.27*mask);
}
