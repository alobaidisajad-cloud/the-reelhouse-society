const fs = require('fs');
const path = require('path');

const filesToProcess = [
  "src/workers/syncEngine.ts",
  "src/utils/withRetry.ts",
  "src/utils/storyExporter.ts",
  "src/stores/content.ts",
  "src/stores/films.ts",
  "src/stores/lounge.ts",
  "src/stores/resetAllStores.ts",
  "src/stores/social.ts",
  "src/stores/domain/socialSlice.ts",
  "src/stores/domain/logSlice.ts",
  "src/stores/domain/listSlice.ts",
  "src/stores/auth.ts",
  "src/providers/AppBootstrapper.tsx",
  "src/hooks/useUpdateUser.ts",
  "src/hooks/useLogFlow.ts",
  "src/lib/revenueCat.ts",
  "src/hooks/useBiometricLock.ts",
  "src/lib/pushNotifications.ts",
  "src/lib/TactileAudio.ts",
  "src/components/film/ShareCardModal.tsx",
  "src/components/ErrorBoundary.tsx",
  "src/components/darkroom/DarkroomCards.tsx",
  "src/components/darkroom/DarkroomHeader.tsx",
  "src/components/profile/TasteDNA.tsx",
  "src/components/profile/ProgrammesSection.tsx",
  "src/components/profile/ProfileTriptych.tsx",
  "src/components/profile/AvatarCropSheet.tsx",
  "src/components/home/FeaturedReview.tsx",
  "src/components/dispatch/ArticleReaderModal.tsx",
  "app/person/[id].tsx",
  "app/user/[username].tsx",
  "app/film/[id].tsx",
  "app/edit-profile.tsx",
  "app/+error.tsx",
  "app/tribunal.tsx",
  "app/log/[id].tsx",
  "app/(tabs)/darkroom.tsx"
];

for (const file of filesToProcess) {
  const fullPath = path.join(__dirname, 'mobile', file);
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${fullPath} - not found`);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;

  // Check if we need to replace
  if (content.includes('console.warn') || content.includes('console.error')) {
    content = content.replace(/console\.warn/g, 'logger.warn');
    content = content.replace(/console\.error/g, 'logger.error');
    changed = true;
  }

  // Add import if missing
  if (changed && !content.includes("from '@/src/utils/logger'") && !content.includes("from '../utils/logger'") && !content.includes("from '../../utils/logger'")) {
    const lines = content.split('\n');
    let importAdded = false;
    
    // Determine relative path based on file depth
    const depth = file.split('/').length - 1;
    let relativePrefix = '../'.repeat(depth);
    if (depth === 0) relativePrefix = './';
    const importStatement = `import { logger } from '@/src/utils/logger';`;
    
    // Find the last import statement
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    
    if (lastImportIndex !== -1) {
      lines.splice(lastImportIndex + 1, 0, importStatement);
      importAdded = true;
    } else {
      lines.unshift(importStatement);
      importAdded = true;
    }
    
    content = lines.join('\n');
  }

  if (changed) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
