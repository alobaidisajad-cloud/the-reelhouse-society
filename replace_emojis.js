import fs from 'fs';
import path from 'path';

const projectRoot = 'c:/Users/OMEN/OneDrive/Desktop/divisionops/reelhouse/src';

const eMap = {
    '↗': { name: 'ArrowUpRight', jsx: '<ArrowUpRight size={10} style={{ display: "inline-block", verticalAlign: "middle" }} />' },
    '🔒': { name: 'Lock', jsx: '<Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} />' },
    '✓': { name: 'Check', jsx: '<Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} />' },
    '↩': { name: 'RotateCcw', jsx: '<RotateCcw size={10} style={{ display: "inline-block", verticalAlign: "middle" }} />' },
    '✕': { name: 'X', jsx: '<X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} />' },
    '○': { name: 'Circle', jsx: '<Circle size={10} style={{ display: "inline-block", verticalAlign: "middle" }} />' },
};

const charRegex = /[↗🔒✓↩✕○]/gu;

function ensureImports(content, iconsFound) {
    if (iconsFound.size === 0) return content;
    const iconsArray = Array.from(iconsFound);
    
    // Find import { ... } from 'lucide-react'
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g;
    let hasLucide = false;
    
    let updatedContent = content.replace(importRegex, (match, grp) => {
        hasLucide = true;
        let existing = grp.split(',').map(s => s.trim()).filter(Boolean);
        iconsArray.forEach(i => {
            if (!existing.includes(i)) existing.push(i);
        });
        return `import { ${existing.join(', ')} } from 'lucide-react'`;
    });
    
    if (!hasLucide) {
        // Find first import statement
        const firstImportIdx = updatedContent.indexOf('import ');
        const importStr = `import { ${iconsArray.join(', ')} } from 'lucide-react'\n`;
        if (firstImportIdx === -1) {
            updatedContent = importStr + updatedContent;
        } else {
            updatedContent = updatedContent.slice(0, firstImportIdx) + importStr + updatedContent.slice(firstImportIdx);
        }
    }
    return updatedContent;
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let iconsFound = new Set();
    
    const originalContent = content;
    
    // We cannot blindly replace inside string literals if they are plain strings used as object keys, 
    // but the emojis listed are exclusively UI rendering text.
    // However, in FilmDetailPage.tsx: `abandoned: '✕ ABANDONED'` -> needs to be JSX `abandoned: <><X /> ABANDONED</>`
    // To handle JSX inside object maps correctly, we shouldn't break JS syntax if the string was quoted.
    
    // Instead of regex replace globally, let's carefully replace patterns
    
    // Replace text inside elements e.g. <span>✕</span>
    content = content.replace(/>(\s*)([↗🔒✓↩✕○])(\s*)</gu, (match, space1, char, space2) => {
        iconsFound.add(eMap[char].name);
        return `>${space1}${eMap[char].jsx}${space2}<`;
    });

    // Replace text immediately following strings e.g. SAVED ✓
    content = content.replace(/([A-Z]+)\s*[↗🔒✓↩✕○]/gu, (match) => {
        const char = match.slice(-1);
        const text = match.slice(0, -1).trim();
        iconsFound.add(eMap[char].name);
        return `<span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>${text} ${eMap[char].jsx}</span>`;
    });

    // Replace strings with bare emojis or emojis + text in strings. e.g. '{ok ? '✓' : '○'}' -> '{ok ? <Check /> : <Circle />}'
    content = content.replace(/['"]([↗🔒✓↩✕○])(?:([^'"]*))['"]/gu, (match, char, rest) => {
        iconsFound.add(eMap[char].name);
        // Return JSX literal! Wait, if it's `{ok ? '✓' : '○'}` and I return `{ok ? <Check /> : <Circle />}` that is fine.
        // What if it is `const y = '✓'`? -> `const y = <><Check/>{rest}</>` -> Syntax error for const without JSX!
        // Let's just wrap it in a Fragment if it's meant to be rendered.
        return `<>${eMap[char].jsx}${rest}</>`;
    });

    content = content.replace(charRegex, (char) => {
        if (!eMap[char]) {
            console.error("Unknown char:", char, char.charCodeAt(0));
            return char;
        }
        iconsFound.add(eMap[char].name);
        return `{${eMap[char].jsx}}`;
    });
    
    // Clean up overlapping syntax errors (e.g. {<><Check/></>}) -> <><Check/></>
    content = content.replace(/\{(<>[^<]+<\/>)\}/g, '$1');

    if (content !== originalContent) {
        content = ensureImports(content, iconsFound);
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
    }
}

function walkDirs(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDirs(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            const code = fs.readFileSync(fullPath, 'utf8');
            if (charRegex.test(code)) {
                processFile(fullPath);
            }
        }
    });
}

walkDirs(projectRoot);
