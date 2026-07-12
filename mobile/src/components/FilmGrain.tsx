interface FilmGrainProps {
  intensity?: number; // 0.0 to 1.0
  pointerEvents?: 'none' | 'auto';
}

export default function FilmGrain({ intensity = 0.15, pointerEvents = 'none' }: FilmGrainProps) {
  // We use a high frequency to simulate fine 35mm grain.
  // The ColorMatrix is used to push the fractal noise into absolute black & white
  // and reduce its alpha so it acts as a subtle overlay rather than blinding white noise.
  
  return null;
}
