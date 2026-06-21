export const GLSL_FILM_GRAIN = `
  uniform float time;
  
  // Random hash based on UV and time
  float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233)) + time) * 43758.5453123);
  }

  vec4 main(vec2 pos) {
      float noise = random(pos);
      // Return solid opaque noise. The alpha blending MUST be handled
      // by the parent <Rect> opacity prop to avoid iOS Metal GPU black-screen bugs.
      return vec4(noise, noise, noise, 1.0);
  }
`;
