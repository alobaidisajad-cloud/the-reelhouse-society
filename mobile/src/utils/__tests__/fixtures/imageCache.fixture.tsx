// What everyPictureStatesItsCache.guard must refuse, then what it must pass. Never imported.
import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image, Image as Picture, ImageBackground } from 'expo-image';
import * as ExpoImage from 'expo-image';

const uri = 'https://example.com/a.jpg';
const props = { source: { uri } };
const policy: 'disk' | 'memory-disk' = 'memory-disk';
// Refused: a picture handed to a function draws where the walk cannot see.
export const Moving = Animated.createAnimatedComponent(Image);

export function Shapes() {
  return (
    <View>
      {/* Refused: none stated. */}
      <Image source={{ uri }} />
      {/* Refused: none stated, under another name. */}
      <Picture source={{ uri }} />
      {/* Refused: none stated, through the namespace. */}
      <ExpoImage.Image source={{ uri }} />
      {/* Refused: a background draws a picture too. */}
      <ImageBackground source={{ uri }}><View /></ImageBackground>
      {/* Refused: a spread the guard cannot read. */}
      <Image {...props} />
      {/* Refused: stated, then a spread after it that may carry an empty one. */}
      <Image cachePolicy="memory-disk" {...props} />
      {/* Refused: a value chosen at run time. */}
      <Image source={{ uri }} cachePolicy={policy} />
      {/* Refused: another policy, in a file not listed. */}
      <Image source={{ uri }} cachePolicy="disk" />
      {/* Passed: stated by name, under another name, in the namespace, in a written spread. */}
      <Image source={{ uri }} cachePolicy="memory-disk" />
      <Picture {...props} cachePolicy={'memory-disk'} />
      <ExpoImage.Image source={{ uri }} cachePolicy="memory-disk" />
      <Image {...({ source: { uri }, cachePolicy: 'memory-disk' } as Record<string, unknown>)} />
      {/* Passed: the module's own calls draw nothing, and a member spelled the same is another. */}
      <Animated.Image source={{ uri }} onLoad={() => Image.clearMemoryCache()} />
    </View>
  );
}
