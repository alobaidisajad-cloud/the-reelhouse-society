import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';

interface TasteMatchProps {
  myLogs: any[];
  theirLogs: any[];
  theirUsername: string;
}

function getRatingVector(logs: any[]) {
  const counts = [0, 0, 0, 0, 0]; // 1-5 stars
  logs.forEach((l: any) => {
    const r = Math.round(l.rating || 0);
    if (r >= 1 && r <= 5) counts[r - 1]++;
  });
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return counts.map(c => c / total);
}

function getDecadeVector(logs: any[]) {
  const decades: Record<number, number> = {};
  logs.forEach((l: any) => {
    if (l.year) {
      const d = Math.floor(l.year / 10) * 10;
      decades[d] = (decades[d] || 0) + 1;
    }
  });
  return decades;
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function TasteMatch({ myLogs = [], theirLogs = [], theirUsername }: TasteMatchProps) {
  if (myLogs.length < 5 || theirLogs.length < 5) return null;

  // Rating pattern similarity (how similarly do you rate films?)
  const myRatings = getRatingVector(myLogs);
  const theirRatings = getRatingVector(theirLogs);
  const ratingMatch = cosineSimilarity(myRatings, theirRatings);

  // Decade preference overlap (do you watch films from the same eras?)
  const myDecades = getDecadeVector(myLogs);
  const theirDecades = getDecadeVector(theirLogs);
  const allDecades = [...new Set([...Object.keys(myDecades), ...Object.keys(theirDecades)].map(Number))].sort();
  const myDecadeVec = allDecades.map(d => myDecades[d] || 0);
  const theirDecadeVec = allDecades.map(d => theirDecades[d] || 0);
  const decadeMatch = cosineSimilarity(myDecadeVec, theirDecadeVec);

  // Overall match (weighted average)
  const match = Math.round((ratingMatch * 0.5 + decadeMatch * 0.5) * 100);

  const label = match >= 80 ? 'KINDRED SPIRITS' : match >= 60 ? 'SIMILAR TASTES' : match >= 40 ? 'PARALLEL REELS' : 'DIVERGENT PATHS';
  const color = match >= 80 ? colors.sepia : match >= 60 ? colors.flicker : match >= 40 ? colors.bone : colors.fog;

  return (
    <View style={s.container}>
      <Text style={s.header}>TASTE COMPATIBILITY</Text>

      <Text style={[s.percentage, { color, textShadowColor: `${color}40` }]}>
        {match}%
      </Text>

      <Text style={[s.label, { color }]}>{label}</Text>

      <Text style={s.description}>
        You and <Text style={{ color: colors.bone }}>@{theirUsername}</Text> share a {match}% cinematic overlap
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: colors.soot,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
    borderRadius: 4,
    padding: 20,
    alignItems: 'center',
    marginVertical: 16,
  },
  header: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.fog,
    marginBottom: 12,
  },
  percentage: {
    fontFamily: fonts.display,
    fontSize: 48,
    lineHeight: 56,
    marginBottom: 4,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  label: {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  description: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.fog,
    lineHeight: 18,
    textAlign: 'center',
  },
});
