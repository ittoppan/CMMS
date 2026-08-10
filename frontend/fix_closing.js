const fs = require('fs');
let code = fs.readFileSync('app/(dashboard)/dashboard/page.tsx', 'utf8');

function fixCards(str) {
  let result = str;
  let searchIndex = 0;
  
  while (true) {
    let startMatch = result.indexOf('<Card elevation="low"', searchIndex);
    if (startMatch === -1) break;
    
    // Find the end of the opening tag
    let endOfOpenTag = result.indexOf('>', startMatch);
    
    // Now we need to find the matching closing tag.
    let depth = 1;
    let i = endOfOpenTag + 1;
    let replaced = false;
    
    while (i < result.length) {
      // Very naive tag parsing: just look for <div, </div, <Card, </Card
      // But wait, the original was <div, so the inner tags might be <divs>.
      // Actually, my regex replaced the OUTERMOST <div className="..."> with <Card ...>.
      // So the depth was 1 for the original div. 
      // If we see <div, depth++. If we see </div, depth--.
      // Wait, <Card also counts as depth? No, we are tracking the depth of the original div tag!
      // But we ALREADY replaced the opening <div with <Card! 
      // So the current tag is <Card. Its matching closing tag in the CURRENT string is </div> (because we didn't replace it yet).
      // So if we treat <div as +1 and </div as -1, we will hit -1 when we reach the matching </div>!
      
      let nextDivOpen = result.indexOf('<div', i);
      let nextDivClose = result.indexOf('</div>', i);
      
      if (nextDivClose === -1) break; // Error
      
      if (nextDivOpen !== -1 && nextDivOpen < nextDivClose) {
        depth++;
        i = nextDivOpen + 4;
      } else {
        depth--;
        if (depth === 0) {
          // Found the matching closing div!
          result = result.substring(0, nextDivClose) + '</Card>' + result.substring(nextDivClose + 6);
          replaced = true;
          searchIndex = nextDivClose + 7; // advance
          break;
        }
        i = nextDivClose + 6;
      }
    }
    
    if (!replaced) {
      searchIndex = endOfOpenTag + 1; // fallback
    }
  }
  return result;
}

code = fixCards(code);
fs.writeFileSync('app/(dashboard)/dashboard/page.tsx', code);
console.log('Fixed closing tags.');
