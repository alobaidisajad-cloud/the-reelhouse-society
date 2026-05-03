const fs = require('fs');

try {
  const data = JSON.parse(fs.readFileSync('eslint-results.json', 'utf8'));
  let output = '';
  
  data.forEach(file => {
    if (file.errorCount > 0 || file.warningCount > 0) {
      output += `\nFILE: ${file.filePath}\n`;
      file.messages.forEach(msg => {
        const severity = msg.severity === 2 ? 'ERROR' : 'WARNING';
        output += `  [${severity}] Line ${msg.line}:${msg.column} - ${msg.message} (${msg.ruleId})\n`;
      });
    }
  });

  fs.writeFileSync('eslint-readable.txt', output.trim());
  console.log('Successfully formatted to eslint-readable.txt');
} catch (e) {
  console.error('Error formatting:', e.message);
}
